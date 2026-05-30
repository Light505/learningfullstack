<?php

require_once __DIR__ . '/../app/config.php';
require_once __DIR__ . '/../app/security.php';
require_once __DIR__ . '/../app/database.php';
require_once __DIR__ . '/../app/marks.php';
require_once __DIR__ . '/../app/request.php';
require_once __DIR__ . '/../app/safety.php';

session_start();
send_security_headers();
header('Content-Type: application/json; charset=UTF-8');

$config = app_config();

try {
    $pdo = create_pdo($config);

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        echo json_encode([
            'ok' => true,
            'count' => count_marks($pdo),
            'marks' => recent_marks($pdo, 10),
        ]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'Method not allowed.']);
        exit;
    }

    clear_old_rate_limits($pdo);

    if (!valid_csrf_token($_POST['csrf_token'] ?? null)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Invalid request. Please refresh and try again.']);
        exit;
    }

    if (($_POST['action'] ?? '') === 'undo') {
        $uid = $_SESSION['last_mark_uid'] ?? '';
        if ($uid === '' || !delete_mark_by_uid($pdo, $uid)) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'No recent mark is available to undo.']);
            exit;
        }

        unset($_SESSION['last_mark_uid']);
        echo json_encode(['ok' => true]);
        exit;
    }

    $mark_input = [
        'display_name' => $_POST['display_name'] ?? '',
        'message' => $_POST['message'] ?? '',
        'drawing' => $_POST['drawing'] ?? '',
        'x_percent' => $_POST['x_percent'] ?? null,
        'y_percent' => $_POST['y_percent'] ?? null,
        'color' => $_POST['color'] ?? '',
        'shape' => $_POST['shape'] ?? '',
    ];

    assert_rate_limit_available($pdo, client_ip(), 'mark_submit');
    $spam_error = validate_spam_content($mark_input);
    if ($spam_error !== null) {
        throw new InvalidArgumentException($spam_error);
    }
    assert_not_recent_duplicate($pdo, $mark_input);

    $mark = save_mark($pdo, $mark_input);
    record_rate_limit_attempt($pdo, client_ip(), 'mark_submit');

    $_SESSION['last_mark_uid'] = $mark['uid'];
    http_response_code(201);
    echo json_encode(['ok' => true, 'mark' => $mark]);
} catch (InvalidArgumentException $e) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
} catch (RuntimeException $e) {
    $status = $e->getCode() === 429 ? 429 : 500;
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('Mark save failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error saving your mark. Please try again later.']);
}
