<?php
declare(strict_types=1);

ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store, max-age=0');

const MAX_POST_BYTES = 2097152;
const SESSION_COOKIE = 'spm_session';
const SESSION_TTL = 315360000;
const AUTH_MIN_ITERATIONS = 10000;
const BACKUP_SCRIPT_FILE = __DIR__ . '/bash_scripts/backup.sh';
const BACKUP_LOG_FILE = '/tmp/simply_pass_manager_backup.log';
const CONFIG_FILE = __DIR__ . '/configs/cfg.ini';
const DB_FILE = __DIR__ . '/DB/db.sqlite';

function appConfig(): array
{
    static $config = null;

    if ($config === null) {
        if (!is_file(CONFIG_FILE)) {
            sendJson(['error' => 'Server configuration is missing'], 500);
        }

        $parsed = parse_ini_file(CONFIG_FILE, false, INI_SCANNER_TYPED);
        if (!is_array($parsed)) {
            sendJson(['error' => 'Server configuration is invalid'], 500);
        }

        $required = ['db_encryption_key', 'client_auth_key', 'default_admin_login', 'default_admin_password'];
        foreach ($required as $key) {
            if (!isset($parsed[$key]) || $parsed[$key] === '') {
                sendJson(['error' => 'Server configuration is incomplete'], 500);
            }
        }

        $config = $parsed;
    }

    return $config;
}

function sendJson(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function runBackupScriptAsync(): void
{
    if (!is_file(BACKUP_SCRIPT_FILE)) {
        return;
    }

    if (stripos(PHP_OS_FAMILY, 'Windows') === 0) {
        if (!function_exists('popen') || !function_exists('pclose')) {
            error_log('Backup script cannot be started: popen() or pclose() is disabled');
            return;
        }

        $bashCommand = 'bash';
        foreach ([
            'C:\\Program Files\\Git\\bin\\bash.exe',
            'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
        ] as $candidate) {
            if (is_file($candidate)) {
                $bashCommand = $candidate;
                break;
            }
        }

        @pclose(@popen('start /B "" ' . escapeshellarg($bashCommand) . ' ' . escapeshellarg(BACKUP_SCRIPT_FILE), 'r'));
        return;
    }

    if (!function_exists('exec')) {
        error_log('Backup script cannot be started: exec() is disabled');
        return;
    }

    @error_log('[' . date('Y-m-d H:i:s') . '] api.php starts backup.sh' . PHP_EOL, 3, BACKUP_LOG_FILE);
    @exec('BACKUP_LOG_FILE=' . escapeshellarg(BACKUP_LOG_FILE) . ' nohup /bin/bash ' . escapeshellarg(BACKUP_SCRIPT_FILE) . ' >> ' . escapeshellarg(BACKUP_LOG_FILE) . ' 2>&1 &');
}

function sendJsonWithBackupScript(array $payload, int $status = 200): void
{
    runBackupScriptAsync();
    sendJson($payload, $status);
}

function openDatabase(): PDO
{
    if (!is_dir(dirname(DB_FILE))) {
        @mkdir(dirname(DB_FILE), 0775, true);
    }
    $db = new PDO('sqlite:' . DB_FILE);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $db->exec('PRAGMA busy_timeout = 5000');
    $db->exec('PRAGMA foreign_keys = ON');
    $db->exec('PRAGMA journal_mode = WAL');
    $db->exec('PRAGMA synchronous = NORMAL');
    return $db;
}

function ensureSchema(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT NOT NULL DEFAULT '',
        login_hash TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        login_ciphertext TEXT NOT NULL,
        login_iv TEXT NOT NULL,
        login_kdf_iterations INTEGER NOT NULL,
        login_kdf_salt TEXT NOT NULL,
        password_ciphertext TEXT NOT NULL,
        password_iv TEXT NOT NULL,
        password_kdf_iterations INTEGER NOT NULL,
        password_kdf_salt TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        is_owner INTEGER NOT NULL DEFAULT 0,
        is_approved INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        user_agent TEXT DEFAULT '',
        ip TEXT DEFAULT '',
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        kdf_iterations INTEGER NOT NULL,
        kdf_salt TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS passwords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        group_id INTEGER DEFAULT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        kdf_iterations INTEGER NOT NULL,
        kdf_salt TEXT NOT NULL,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        favorited_at INTEGER DEFAULT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE SET NULL
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS app_settings (
        name TEXT PRIMARY KEY,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        kdf_iterations INTEGER NOT NULL,
        kdf_salt TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    )");

    $db->exec('CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)');
    $db->exec('CREATE INDEX IF NOT EXISTS idx_passwords_user_updated ON passwords(user_id, updated_at)');
    $db->exec('CREATE INDEX IF NOT EXISTS idx_groups_user_updated ON groups(user_id, updated_at)');
}

function requestData(): array
{
    $length = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
    if ($length > MAX_POST_BYTES) {
        sendJson(['error' => 'Request body is too large'], 413);
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw === false ? '' : $raw, true);

    if (!is_array($data)) {
        sendJson(['error' => 'Invalid JSON'], 400);
    }

    return $data;
}

function encryptedFields(array $data): array
{
    $ciphertext = $data['ciphertext'] ?? '';
    $iv = $data['iv'] ?? '';
    $iterations = isset($data['kdf_iterations']) ? (int)$data['kdf_iterations'] : 0;
    $salt = isset($data['kdf_salt']) ? (string)$data['kdf_salt'] : '';

    if (!is_string($ciphertext) || !is_string($iv) || $ciphertext === '' || $iv === '') {
        sendJson(['error' => 'Missing encrypted payload'], 400);
    }

    if (strlen($ciphertext) > MAX_POST_BYTES || strlen($iv) > 256 || strlen($salt) > 256) {
        sendJson(['error' => 'Encrypted payload is too large'], 400);
    }

    if ($iterations < AUTH_MIN_ITERATIONS || $salt === '') {
        sendJson(['error' => 'Missing KDF metadata'], 400);
    }

    return [
        'ciphertext' => $ciphertext,
        'iv' => $iv,
        'kdf_iterations' => $iterations,
        'kdf_salt' => $salt,
    ];
}

function decryptPayload(array $encrypted, string $key): array
{
    $plain = decryptTextValue($encrypted, $key);

    if ($plain === null) {
        sendJson(['error' => 'Invalid auth encryption key'], 400);
    }

    $payload = json_decode($plain, true);
    if (!is_array($payload)) {
        sendJson(['error' => 'Invalid auth payload'], 400);
    }

    return $payload;
}

function decryptTextValue(array $encrypted, string $key): ?string
{
    $raw = base64_decode((string)$encrypted['ciphertext'], true);
    $iv = base64_decode((string)$encrypted['iv'], true);
    $salt = base64_decode((string)$encrypted['kdf_salt'], true);

    if ($raw === false || $iv === false || $salt === false || strlen($raw) <= 16) {
        return null;
    }

    $tag = substr($raw, -16);
    $ciphertext = substr($raw, 0, -16);
    $derived = hash_pbkdf2('sha256', $key, $salt, (int)$encrypted['kdf_iterations'], 32, true);
    $plain = openssl_decrypt($ciphertext, 'aes-256-gcm', $derived, OPENSSL_RAW_DATA, $iv, $tag);

    if ($plain === false) {
        return null;
    }

    return $plain;
}

function phpEncryptText(string $text, string $key): array
{
    $iterations = 210000;
    $salt = random_bytes(32);
    $iv = random_bytes(12);
    $derived = hash_pbkdf2('sha256', $key, $salt, $iterations, 32, true);
    $tag = '';
    $ciphertext = openssl_encrypt($text, 'aes-256-gcm', $derived, OPENSSL_RAW_DATA, $iv, $tag);

    if ($ciphertext === false) {
        throw new RuntimeException('Encryption failed');
    }

    return [
        'ciphertext' => base64_encode($ciphertext . $tag),
        'iv' => base64_encode($iv),
        'kdf_iterations' => $iterations,
        'kdf_salt' => base64_encode($salt),
    ];
}

function cacheFront(): string
{
    return (string)appConfig()['db_encryption_key'];
}

function requiredAuthKeyValue(): string
{
    return (string)appConfig()['client_auth_key'];
}

function settingPayload(array $row): array
{
    return [
        'ciphertext' => $row['ciphertext'],
        'iv' => $row['iv'],
        'kdf_iterations' => (int)$row['kdf_iterations'],
        'kdf_salt' => $row['kdf_salt'],
    ];
}

function ensureAuthKeySecret(PDO $db): void
{
    $stmt = $db->prepare('SELECT * FROM app_settings WHERE name = ? LIMIT 1');
    $stmt->execute(['auth_key']);
    $row = $stmt->fetch();
    $serverKey = cacheFront();
    $requiredKey = requiredAuthKeyValue();

    if ($row && decryptTextValue(settingPayload($row), $serverKey) === $requiredKey) {
        return;
    }

    $encrypted = phpEncryptText($requiredKey, $serverKey);
    $stmt = $db->prepare('REPLACE INTO app_settings (name, ciphertext, iv, kdf_iterations, kdf_salt, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        'auth_key',
        $encrypted['ciphertext'],
        $encrypted['iv'],
        $encrypted['kdf_iterations'],
        $encrypted['kdf_salt'],
        time(),
    ]);
}

function storedAuthKey(PDO $db): string
{
    ensureAuthKeySecret($db);
    $stmt = $db->prepare('SELECT * FROM app_settings WHERE name = ? LIMIT 1');
    $stmt->execute(['auth_key']);
    $row = $stmt->fetch();

    if (!$row) {
        sendJson(['error' => 'Auth key is not configured'], 500);
    }

    $key = decryptTextValue(settingPayload($row), cacheFront());
    if ($key === null || $key === '') {
        sendJson(['error' => 'Auth key is not configured'], 500);
    }

    return $key;
}

function requireValidAuthKey(PDO $db, string $authKey): void
{
    if (!hash_equals(storedAuthKey($db), $authKey)) {
        sendJson(['error' => 'Invalid auth encryption key'], 401);
    }
}

function ensureDefaultAdmin(PDO $db): void
{
    $config = appConfig();
    $adminLogin = (string)$config['default_admin_login'];
    $adminPassword = (string)$config['default_admin_password'];

    $exists = (int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($exists > 0) {
        $db->prepare("UPDATE users SET login = CASE WHEN login = '' THEN ? ELSE login END, is_admin = 1, is_owner = 1, is_approved = 1 WHERE id = 1 AND login_hash = ?")->execute([$adminLogin, hash('sha256', strtolower($adminLogin))]);
        return;
    }

    $now = time();
    $loginEnc = phpEncryptText($adminLogin, requiredAuthKeyValue());
    $passEnc = phpEncryptText($adminPassword, requiredAuthKeyValue());
    $stmt = $db->prepare("INSERT INTO users (
        login, login_hash, password_hash,
        login_ciphertext, login_iv, login_kdf_iterations, login_kdf_salt,
        password_ciphertext, password_iv, password_kdf_iterations, password_kdf_salt,
        is_admin, is_owner, is_approved, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?)");
    $stmt->execute([
        $adminLogin,
        hash('sha256', strtolower($adminLogin)),
        password_hash($adminPassword, PASSWORD_DEFAULT),
        $loginEnc['ciphertext'],
        $loginEnc['iv'],
        $loginEnc['kdf_iterations'],
        $loginEnc['kdf_salt'],
        $passEnc['ciphertext'],
        $passEnc['iv'],
        $passEnc['kdf_iterations'],
        $passEnc['kdf_salt'],
        $now,
        $now,
    ]);
}

function userPayload(array $user): array
{
    return [
        'id' => (int)$user['id'],
        'login' => (string)($user['login'] ?? ''),
        'login_hash' => $user['login_hash'],
        'is_admin' => (int)$user['is_admin'] === 1,
        'is_owner' => (int)($user['is_owner'] ?? 0) === 1,
        'is_approved' => (int)$user['is_approved'] === 1,
        'created_at' => (int)$user['created_at'],
        'updated_at' => (int)$user['updated_at'],
    ];
}

function setSessionCookie(string $token): void
{
    $path = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/') . '/';
    setcookie(SESSION_COOKIE, $token, [
        'expires' => time() + SESSION_TTL,
        'path' => $path,
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function clearSessionCookie(): void
{
    $path = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/') . '/';
    setcookie(SESSION_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => $path,
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function createSession(PDO $db, int $userId): string
{
    $token = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(32));
    $now = time();
    $stmt = $db->prepare('INSERT INTO sessions (user_id, token_hash, csrf_token, created_at, last_seen_at, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $userId,
        hash('sha256', $token),
        $csrf,
        $now,
        $now,
        $now + SESSION_TTL,
        substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500),
        substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 80),
    ]);
    setSessionCookie($token);
    return $csrf;
}

function currentUser(PDO $db): ?array
{
    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!is_string($token) || $token === '') {
        return null;
    }

    $stmt = $db->prepare('SELECT u.*, s.csrf_token AS _csrf_token FROM sessions s INNER JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1');
    $stmt->execute([hash('sha256', $token), time()]);
    $user = $stmt->fetch();

    if (!$user) {
        return null;
    }

    $db->prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?')->execute([time(), hash('sha256', $token)]);
    return $user;
}

function requireCsrf(?array $currentUser, array $data): void
{
    $expected = $currentUser['_csrf_token'] ?? '';
    $provided = isset($data['csrf']) ? (string)$data['csrf'] : '';

    if (!is_string($expected) || $expected === '' || !hash_equals($expected, $provided)) {
        sendJson(['error' => 'Invalid CSRF token'], 403);
    }
}

function requireUser(?array $user): array
{
    if (!$user) {
        sendJson(['error' => 'Unauthorized'], 401);
    }

    return $user;
}

function requireAdmin(?array $user): array
{
    $user = requireUser($user);
    if ((int)$user['is_admin'] !== 1) {
        sendJson(['error' => 'Forbidden'], 403);
    }

    return $user;
}

function authPayloadFromRequest(array $data, PDO $db): array
{
    $authKey = isset($data['auth_key']) ? (string)$data['auth_key'] : '';
    $encrypted = isset($data['auth_payload']) && is_array($data['auth_payload']) ? encryptedFields($data['auth_payload']) : null;

    if ($authKey === '' || !$encrypted) {
        sendJson(['error' => 'Missing auth payload'], 400);
    }

    requireValidAuthKey($db, $authKey);
    $payload = decryptPayload($encrypted, $authKey);
    $login = trim((string)($payload['login'] ?? ''));
    $password = (string)($payload['password'] ?? '');

    if ($login === '' || $password === '') {
        sendJson(['error' => 'Login and password are required'], 400);
    }

    return [$login, $password, $encrypted];
}

function decryptedAdminPayload(array $data, PDO $db): array
{
    $authKey = isset($data['auth_key']) ? (string)$data['auth_key'] : '';
    $encrypted = isset($data['auth_payload']) && is_array($data['auth_payload']) ? encryptedFields($data['auth_payload']) : null;

    if ($authKey === '' || !$encrypted) {
        sendJson(['error' => 'Missing auth payload'], 400);
    }

    requireValidAuthKey($db, $authKey);
    return decryptPayload($encrypted, $authKey);
}

function updateUserEncryptedCredentials(PDO $db, int $userId, string $login, string $password, array $encrypted, int $isAdmin, int $isApproved): void
{
    $now = time();
    $stmt = $db->prepare("UPDATE users SET
        login = ?, login_hash = ?, password_hash = ?,
        login_ciphertext = ?, login_iv = ?, login_kdf_iterations = ?, login_kdf_salt = ?,
        password_ciphertext = ?, password_iv = ?, password_kdf_iterations = ?, password_kdf_salt = ?,
        is_admin = ?, is_approved = ?, updated_at = ?
        WHERE id = ?");
    $stmt->execute([
        $login,
        hash('sha256', strtolower($login)),
        password_hash($password, PASSWORD_DEFAULT),
        $encrypted['login']['ciphertext'],
        $encrypted['login']['iv'],
        $encrypted['login']['kdf_iterations'],
        $encrypted['login']['kdf_salt'],
        $encrypted['password']['ciphertext'],
        $encrypted['password']['iv'],
        $encrypted['password']['kdf_iterations'],
        $encrypted['password']['kdf_salt'],
        $isAdmin,
        $isApproved,
        $now,
        $userId,
    ]);
}

function updateUserLoginAndFlags(PDO $db, int $userId, string $login, array $loginEncrypted, int $isAdmin, int $isApproved): void
{
    $stmt = $db->prepare("UPDATE users SET
        login = ?, login_hash = ?,
        login_ciphertext = ?, login_iv = ?, login_kdf_iterations = ?, login_kdf_salt = ?,
        is_admin = ?, is_approved = ?, updated_at = ?
        WHERE id = ?");
    $stmt->execute([
        $login,
        hash('sha256', strtolower($login)),
        $loginEncrypted['ciphertext'],
        $loginEncrypted['iv'],
        $loginEncrypted['kdf_iterations'],
        $loginEncrypted['kdf_salt'],
        $isAdmin,
        $isApproved,
        time(),
        $userId,
    ]);
}

function updateUserFlags(PDO $db, int $userId, int $isAdmin, int $isApproved): void
{
    $stmt = $db->prepare('UPDATE users SET is_admin = ?, is_approved = ?, updated_at = ? WHERE id = ?');
    $stmt->execute([$isAdmin, $isApproved, time(), $userId]);
}

function updateUserPassword(PDO $db, int $userId, string $password, array $passwordEncrypted): void
{
    $stmt = $db->prepare("UPDATE users SET
        password_hash = ?,
        password_ciphertext = ?, password_iv = ?, password_kdf_iterations = ?, password_kdf_salt = ?,
        updated_at = ?
        WHERE id = ?");
    $stmt->execute([
        password_hash($password, PASSWORD_DEFAULT),
        $passwordEncrypted['ciphertext'],
        $passwordEncrypted['iv'],
        $passwordEncrypted['kdf_iterations'],
        $passwordEncrypted['kdf_salt'],
        time(),
        $userId,
    ]);
}

try {
    $db = openDatabase();
    ensureSchema($db);
    ensureAuthKeySecret($db);
    ensureDefaultAdmin($db);

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = $_GET['action'] ?? '';
    $currentUser = currentUser($db);

    if ($method === 'GET' && $action === 'session') {
        sendJson([
            'authenticated' => (bool)$currentUser,
            'user' => $currentUser ? userPayload($currentUser) : null,
            'csrf' => $currentUser ? (string)($currentUser['_csrf_token'] ?? '') : '',
        ]);
    }

    if ($method === 'GET' && $action === 'admin_users') {
        $admin = requireAdmin($currentUser);
        $users = $db->query('SELECT * FROM users ORDER BY created_at ASC')->fetchAll();
        sendJson([
            'users' => array_map('userPayload', $users),
            'current_user' => userPayload($admin),
            'csrf' => (string)($admin['_csrf_token'] ?? ''),
        ]);
    }

    if ($method === 'GET') {
        $user = requireUser($currentUser);
        $passwords = $db->prepare('SELECT id, group_id, ciphertext, iv, kdf_iterations, kdf_salt, is_favorite, created_at, updated_at FROM passwords WHERE user_id = ? ORDER BY is_favorite DESC, favorited_at DESC, updated_at DESC');
        $passwords->execute([(int)$user['id']]);
        $groups = $db->prepare('SELECT id, ciphertext, iv, kdf_iterations, kdf_salt, sort_order, created_at, updated_at FROM groups WHERE user_id = ? ORDER BY sort_order ASC, updated_at ASC');
        $groups->execute([(int)$user['id']]);
        sendJson(['passwords' => $passwords->fetchAll(), 'groups' => $groups->fetchAll()]);
    }

    if ($method !== 'POST') {
        sendJson(['error' => 'Method not allowed'], 405);
    }

    $data = requestData();
    $action = (string)($data['action'] ?? '');
    $now = time();

    if ($action === 'login') {
        [$login, $password] = authPayloadFromRequest($data, $db);
        $stmt = $db->prepare('SELECT * FROM users WHERE login_hash = ? LIMIT 1');
        $stmt->execute([hash('sha256', strtolower($login))]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            sendJson(['error' => 'Invalid login or password'], 401);
        }

        if ((int)$user['is_approved'] !== 1) {
            sendJson(['error' => 'Account is not approved yet'], 403);
        }

        if ((string)($user['login'] ?? '') === '') {
            $db->prepare('UPDATE users SET login = ?, updated_at = ? WHERE id = ?')->execute([$login, $now, (int)$user['id']]);
            $user['login'] = $login;
        }

        $db->prepare('DELETE FROM sessions WHERE last_seen_at < ?')->execute([$now - 30 * 86400]);

        $csrf = createSession($db, (int)$user['id']);
        sendJsonWithBackupScript(['status' => 'ok', 'user' => userPayload($user), 'csrf' => $csrf]);
    }

    if ($action === 'register') {
        [$login, $password, $encrypted] = authPayloadFromRequest($data, $db);
        $loginEncrypted = isset($data['login_encrypted']) && is_array($data['login_encrypted']) ? encryptedFields($data['login_encrypted']) : $encrypted;
        $passwordEncrypted = isset($data['password_encrypted']) && is_array($data['password_encrypted']) ? encryptedFields($data['password_encrypted']) : $encrypted;
        $loginHash = hash('sha256', strtolower($login));

        $stmt = $db->prepare('SELECT COUNT(*) FROM users WHERE login_hash = ?');
        $stmt->execute([$loginHash]);
        if ((int)$stmt->fetchColumn() > 0) {
            sendJson(['error' => 'Login already exists'], 409);
        }

        $stmt = $db->prepare("INSERT INTO users (
            login, login_hash, password_hash,
            login_ciphertext, login_iv, login_kdf_iterations, login_kdf_salt,
            password_ciphertext, password_iv, password_kdf_iterations, password_kdf_salt,
            is_admin, is_approved, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)");
        $stmt->execute([
            $login,
            $loginHash,
            password_hash($password, PASSWORD_DEFAULT),
            $loginEncrypted['ciphertext'],
            $loginEncrypted['iv'],
            $loginEncrypted['kdf_iterations'],
            $loginEncrypted['kdf_salt'],
            $passwordEncrypted['ciphertext'],
            $passwordEncrypted['iv'],
            $passwordEncrypted['kdf_iterations'],
            $passwordEncrypted['kdf_salt'],
            $now,
            $now,
        ]);

        sendJsonWithBackupScript(['status' => 'pending']);
    }

    if ($action === 'logout') {
        requireCsrf($currentUser, $data);
        $token = $_COOKIE[SESSION_COOKIE] ?? '';
        if (is_string($token) && $token !== '') {
            $db->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
        }
        clearSessionCookie();
        sendJsonWithBackupScript(['status' => 'ok']);
    }

    if ($action === 'admin_update_user') {
        $admin = requireAdmin($currentUser);
        requireCsrf($currentUser, $data);
        $userId = (int)($data['id'] ?? 0);
        $login = trim((string)($data['login'] ?? ''));

        if (!$userId || $login === '') {
            sendJson(['error' => 'Invalid user update'], 400);
        }

        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $target = $stmt->fetch();
        if (!$target) {
            sendJson(['error' => 'User not found'], 404);
        }

        $loginChanged = $login !== (string)($target['login'] ?? '');
        $newIsAdmin = !empty($data['is_admin']) ? 1 : 0;
        $newIsApproved = !empty($data['is_approved']) ? 1 : 0;
        $oldIsAdmin = (int)$target['is_admin'] === 1;
        $isOwnerTarget = (int)($target['is_owner'] ?? 0) === 1;
        $isOwnerAdmin = (int)($admin['is_owner'] ?? 0) === 1;

        if ($isOwnerTarget && $newIsAdmin !== 1) {
            sendJson(['error' => 'Main admin cannot lose admin rights'], 400);
        }

        if ($isOwnerTarget) {
            $newIsAdmin = 1;
            $newIsApproved = 1;
        }

        if ($oldIsAdmin && !$newIsAdmin && !$isOwnerAdmin) {
            sendJson(['error' => 'Only main admin can revoke admin rights'], 403);
        }

        if ($loginChanged) {
            $payload = decryptedAdminPayload($data, $db);
            $payloadLogin = trim((string)($payload['login'] ?? ''));
            $loginEncrypted = isset($data['login_encrypted']) && is_array($data['login_encrypted']) ? encryptedFields($data['login_encrypted']) : null;

            if ($payloadLogin === '' || $payloadLogin !== $login || !$loginEncrypted) {
                sendJson(['error' => 'Invalid encrypted login update'], 400);
            }

            $newLoginHash = hash('sha256', strtolower($login));
            $stmt = $db->prepare('SELECT COUNT(*) FROM users WHERE login_hash = ? AND id <> ?');
            $stmt->execute([$newLoginHash, $userId]);
            if ((int)$stmt->fetchColumn() > 0) {
                sendJson(['error' => 'Login already exists'], 409);
            }

            updateUserLoginAndFlags($db, $userId, $login, $loginEncrypted, $newIsAdmin, $newIsApproved);
            sendJsonWithBackupScript(['status' => 'ok']);
        }

        updateUserFlags($db, $userId, $newIsAdmin, $newIsApproved);
        sendJsonWithBackupScript(['status' => 'ok']);
    }

    if ($action === 'admin_reset_password') {
        requireAdmin($currentUser);
        requireCsrf($currentUser, $data);
        $userId = (int)($data['id'] ?? 0);
        $payload = decryptedAdminPayload($data, $db);
        $password = (string)($payload['password'] ?? '');
        $passwordEncrypted = isset($data['password_encrypted']) && is_array($data['password_encrypted']) ? encryptedFields($data['password_encrypted']) : null;

        if (!$userId || $password === '' || !$passwordEncrypted) {
            sendJson(['error' => 'Invalid password reset'], 400);
        }

        $stmt = $db->prepare('SELECT COUNT(*) FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        if ((int)$stmt->fetchColumn() === 0) {
            sendJson(['error' => 'User not found'], 404);
        }

        updateUserPassword($db, $userId, $password, $passwordEncrypted);
        $db->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$userId]);
        sendJsonWithBackupScript(['status' => 'ok']);
    }

    if ($action === 'admin_approve_user') {
        requireAdmin($currentUser);
        requireCsrf($currentUser, $data);
        $db->prepare('UPDATE users SET is_approved = 1, updated_at = ? WHERE id = ?')->execute([$now, (int)($data['id'] ?? 0)]);
        sendJsonWithBackupScript(['status' => 'ok']);
    }

    if ($action === 'admin_delete_user') {
        $admin = requireAdmin($currentUser);
        requireCsrf($currentUser, $data);
        $id = (int)($data['id'] ?? 0);
        if ($id === (int)$admin['id']) {
            sendJson(['error' => 'Admin cannot delete current account'], 400);
        }
        $stmt = $db->prepare('SELECT is_admin, is_owner FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $target = $stmt->fetch();
        if (!$target) {
            sendJson(['error' => 'User not found'], 404);
        }
        if ((int)($target['is_owner'] ?? 0) === 1) {
            sendJson(['error' => 'Main admin cannot be deleted'], 400);
        }
        if ((int)($target['is_admin'] ?? 0) === 1 && (int)($admin['is_owner'] ?? 0) !== 1) {
            sendJson(['error' => 'Only main admin can delete admin accounts'], 403);
        }
        $db->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        sendJsonWithBackupScript(['status' => 'ok']);
    }

    $user = requireUser($currentUser);
    requireCsrf($currentUser, $data);

    if ($action === 'save_password') {
        $encrypted = encryptedFields($data);
        $groupId = !empty($data['group_id']) ? (int)$data['group_id'] : null;
        $passwordId = !empty($data['id']) ? (int)$data['id'] : 0;
        $saved = null;

        if ($groupId !== null) {
            $stmt = $db->prepare('SELECT COUNT(*) FROM groups WHERE id = ? AND user_id = ?');
            $stmt->execute([$groupId, (int)$user['id']]);
            if ((int)$stmt->fetchColumn() === 0) {
                $groupId = null;
            }
        }

        if ($passwordId > 0) {
            $stmt = $db->prepare('UPDATE passwords SET group_id = ?, ciphertext = ?, iv = ?, kdf_iterations = ?, kdf_salt = ?, updated_at = ? WHERE id = ? AND user_id = ?');
            $stmt->execute([$groupId, $encrypted['ciphertext'], $encrypted['iv'], $encrypted['kdf_iterations'], $encrypted['kdf_salt'], $now, $passwordId, (int)$user['id']]);
        } else {
            $stmt = $db->prepare('INSERT INTO passwords (user_id, group_id, ciphertext, iv, kdf_iterations, kdf_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([(int)$user['id'], $groupId, $encrypted['ciphertext'], $encrypted['iv'], $encrypted['kdf_iterations'], $encrypted['kdf_salt'], $now, $now]);
            $passwordId = (int)$db->lastInsertId();
        }

        $stmt = $db->prepare('SELECT id, group_id, ciphertext, iv, kdf_iterations, kdf_salt, is_favorite, created_at, updated_at FROM passwords WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$passwordId, (int)$user['id']]);
        $saved = $stmt->fetch();

        if (!$saved) {
            sendJson(['error' => 'Password not found'], 404);
        }

        sendJsonWithBackupScript(['status' => 'ok', 'password' => $saved]);
    }

    if ($action === 'delete_password') {
        $db->prepare('DELETE FROM passwords WHERE id = ? AND user_id = ?')->execute([(int)($data['id'] ?? 0), (int)$user['id']]);
        sendJsonWithBackupScript(['status' => 'ok']);
    }

    if ($action === 'toggle_favorite') {
        $passwordId = (int)($data['id'] ?? 0);
        $isFavorite = !empty($data['is_favorite']) ? 1 : 0;

        if ($passwordId <= 0) {
            sendJson(['error' => 'Invalid password id'], 400);
        }

        $favoritedAt = $isFavorite ? $now : null;
        $stmt = $db->prepare('UPDATE passwords SET is_favorite = ?, favorited_at = ? WHERE id = ? AND user_id = ?');
        $stmt->execute([$isFavorite, $favoritedAt, $passwordId, (int)$user['id']]);

        if ($stmt->rowCount() === 0) {
            sendJson(['error' => 'Password not found'], 404);
        }

        sendJsonWithBackupScript(['status' => 'ok', 'id' => $passwordId, 'is_favorite' => $isFavorite]);
    }

    if ($action === 'save_group') {
        $encrypted = encryptedFields($data);
        $groupId = !empty($data['id']) ? (int)$data['id'] : 0;
        $saved = null;

        if ($groupId > 0) {
            $stmt = $db->prepare('UPDATE groups SET ciphertext = ?, iv = ?, kdf_iterations = ?, kdf_salt = ?, updated_at = ? WHERE id = ? AND user_id = ?');
            $stmt->execute([$encrypted['ciphertext'], $encrypted['iv'], $encrypted['kdf_iterations'], $encrypted['kdf_salt'], $now, $groupId, (int)$user['id']]);
        } else {
            $stmt = $db->prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM groups WHERE user_id = ?');
            $stmt->execute([(int)$user['id']]);
            $nextOrder = (int)$stmt->fetchColumn();

            $stmt = $db->prepare('INSERT INTO groups (user_id, ciphertext, iv, kdf_iterations, kdf_salt, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([(int)$user['id'], $encrypted['ciphertext'], $encrypted['iv'], $encrypted['kdf_iterations'], $encrypted['kdf_salt'], $nextOrder, $now, $now]);
            $groupId = (int)$db->lastInsertId();
        }

        $stmt = $db->prepare('SELECT id, ciphertext, iv, kdf_iterations, kdf_salt, sort_order, created_at, updated_at FROM groups WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$groupId, (int)$user['id']]);
        $saved = $stmt->fetch();

        if (!$saved) {
            sendJson(['error' => 'Group not found'], 404);
        }

        sendJsonWithBackupScript(['status' => 'ok', 'group' => $saved]);
    }

    if ($action === 'delete_group') {
        $id = (int)($data['id'] ?? 0);
        $db->prepare('UPDATE passwords SET group_id = NULL WHERE group_id = ? AND user_id = ?')->execute([$id, (int)$user['id']]);
        $db->prepare('DELETE FROM groups WHERE id = ? AND user_id = ?')->execute([$id, (int)$user['id']]);
        sendJsonWithBackupScript(['status' => 'ok']);
    }

    if ($action === 'reorder_groups') {
        $orderRaw = $data['order'] ?? [];
        if (!is_array($orderRaw) || count($orderRaw) === 0) {
            sendJson(['error' => 'Empty order'], 400);
        }

        $ids = [];
        foreach ($orderRaw as $rawId) {
            $id = (int)$rawId;
            if ($id <= 0) {
                sendJson(['error' => 'Invalid group id'], 400);
            }
            $ids[] = $id;
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("SELECT COUNT(*) FROM groups WHERE user_id = ? AND id IN ($placeholders)");
        $stmt->execute(array_merge([(int)$user['id']], $ids));
        if ((int)$stmt->fetchColumn() !== count($ids)) {
            sendJson(['error' => 'Unknown group id in order'], 400);
        }

        $db->beginTransaction();
        $update = $db->prepare('UPDATE groups SET sort_order = ? WHERE id = ? AND user_id = ?');
        foreach ($ids as $index => $id) {
            $update->execute([$index + 1, $id, (int)$user['id']]);
        }
        $db->commit();

        sendJsonWithBackupScript(['status' => 'ok']);
    }

    sendJson(['error' => 'Unknown action'], 400);
} catch (Throwable $e) {
    error_log('Password manager API error: ' . $e->getMessage());
    sendJson(['error' => 'Server error'], 500);
}
