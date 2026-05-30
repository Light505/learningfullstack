<?php

require_once __DIR__ . '/../app/config.php';
require_once __DIR__ . '/../app/database.php';
require_once __DIR__ . '/../app/marks.php';
require_once __DIR__ . '/../app/security.php';

send_security_headers();
header('Content-Type: text/event-stream; charset=UTF-8');
header('Cache-Control: no-cache, no-transform');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');

ignore_user_abort(true);
set_time_limit(0);

function send_mark_event(string $event, array $payload): void
{
    echo "event: {$event}\n";
    echo 'data: ' . json_encode($payload) . "\n\n";
    @ob_flush();
    flush();
}

try {
    $pdo = create_pdo(app_config());
    $last_signature = '';

    echo "retry: 3000\n\n";
    @ob_flush();
    flush();

    for ($attempt = 0; $attempt < 30 && connection_status() === CONNECTION_NORMAL; $attempt += 1) {
        $count = count_marks($pdo);
        $recent = recent_marks($pdo, 10);
        $uids = mark_uids($pdo);
        $signature = hash('sha256', json_encode([$count, $recent, $uids]));

        if ($signature !== $last_signature) {
            send_mark_event('marks.sync', [
                'ok' => true,
                'count' => $count,
                'marks' => $recent,
                'mark_uids' => $uids,
            ]);
            $last_signature = $signature;
        } else {
            send_mark_event('heartbeat', ['ok' => true]);
        }

        sleep(2);
    }
} catch (Throwable $e) {
    error_log('Mark stream failed: ' . $e->getMessage());
    send_mark_event('error', ['ok' => false, 'error' => 'Live updates are unavailable.']);
}
