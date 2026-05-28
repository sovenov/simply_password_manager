<?php
declare(strict_types=1);

header('Content-Type: text/plain; charset=UTF-8');

$logFile = __DIR__ . DIRECTORY_SEPARATOR . 'cache.log';

function write_cache_log(string $status, string $description): bool
{
    global $logFile;

    $entry = [
        'time' => time(),
        'status' => $status,
        'ip' => $_SERVER['REMOTE_ADDR'] ?? '',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
        'description' => $description,
    ];

    $json = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        $json = '{"time":' . time() . ',"status":"error","description":"json_encode failed"}';
    }

    return file_put_contents($logFile, $json . PHP_EOL, FILE_APPEND | LOCK_EX) !== false;
}

try {
    $rootDir = dirname(__DIR__);
    $files = [
        $rootDir . DIRECTORY_SEPARATOR . 'index.php',
        $rootDir . DIRECTORY_SEPARATOR . 'admin' . DIRECTORY_SEPARATOR . 'index.php',
    ];
    $timestamp = (string) time();
    $updatedCount = 0;
    $updatedFiles = 0;

    foreach ($files as $indexFile) {
        if (!is_file($indexFile)) {
            continue;
        }

        if (!is_readable($indexFile) || !is_writable($indexFile)) {
            throw new RuntimeException(basename($indexFile) . ' is not readable or writable');
        }

        $html = file_get_contents($indexFile);
        if ($html === false) {
            throw new RuntimeException('Unable to read ' . basename($indexFile));
        }

        $fileUpdatedCount = 0;
        $updatedHtml = preg_replace_callback(
            '~(?P<prefix>\b(?:href|src)\s*=\s*["\'])(?P<url>[^"\']+\.(?:css|js|ico))(?:\?[^"\']*)?(?P<suffix>["\'])~i',
            function (array $matches) use ($timestamp, &$fileUpdatedCount): string {
                $url = $matches['url'];
                $path = parse_url($url, PHP_URL_PATH);
                $basename = basename(is_string($path) ? $path : $url);

                if (strcasecmp($basename, 'jquery-1.12.4.min.js') === 0) {
                    return $matches[0];
                }

                $fileUpdatedCount++;
                return $matches['prefix'] . $url . '?' . $timestamp . $matches['suffix'];
            },
            $html
        );

        if ($updatedHtml === null) {
            throw new RuntimeException('Regular expression replacement failed');
        }

        if ($fileUpdatedCount === 0) {
            continue;
        }

        if (file_put_contents($indexFile, $updatedHtml, LOCK_EX) === false) {
            throw new RuntimeException('Unable to write ' . basename($indexFile));
        }

        $updatedCount += $fileUpdatedCount;
        $updatedFiles++;
    }

    if ($updatedCount === 0) {
        throw new RuntimeException('No cacheable CSS/JS references found');
    }

    if (!write_cache_log('ok', 'Updated ' . $updatedCount . ' asset URLs with timestamp ' . $timestamp)) {
        throw new RuntimeException('Unable to write cache.log');
    }

    echo 'OK';
} catch (Throwable $e) {
    http_response_code(500);
    write_cache_log('error', $e->getMessage());
    echo 'Error';
}
