<?php
declare(strict_types=1);

ini_set('display_errors', '0');

$allowed = false;
try {
    $db = new PDO('sqlite:' . dirname(__DIR__) . '/DB/db.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $token = $_COOKIE['spm_session'] ?? '';

    if (is_string($token) && $token !== '') {
        $stmt = $db->prepare('SELECT u.is_admin FROM sessions s INNER JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1');
        $stmt->execute([hash('sha256', $token), time()]);
        $row = $stmt->fetch();
        $allowed = $row && (int)$row['is_admin'] === 1;
    }
} catch (Throwable $e) {
    $allowed = false;
}

if (!$allowed) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store, max-age=0');
    echo 'Forbidden';
    exit;
}

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, max-age=0');
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'">
    <title>Админ-панель</title>
    <link rel="icon" type="image/x-icon" href="../password.ico">
    <link rel="stylesheet" href="../styles.css?1779582909">
</head>
<body>
    <div class="page-shell admin-shell">
        <div class="admin-header">
            <h3>Учётки</h3>
            <a href="../index.php" class="admin-back">К менеджеру</a>
        </div>
        <div class="auth-message" id="adminMessage"></div>
        <div id="usersList"></div>
    </div>

    <script src="../jquery-3.7.1.min.js"></script>
    <script src="panel.js?1779966399"></script>
</body>
</html>
