<?php

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/request.php';
require_once __DIR__ . '/response.php';
require_once __DIR__ . '/database.php';

session_start();
send_security_headers();

$config = app_config();

try {
    $pdo = create_pdo($config);
} catch (PDOException $e) {
    error_log('Database connection failed: ' . $e->getMessage());
    abort_with_error(
        'Service temporarily unavailable. Please try again later.',
        'Database connection failed: ' . $e->getMessage(),
        $config['debug'],
        503
    );
}

csrf_token();
