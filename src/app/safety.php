<?php

function safety_limits(): array
{
    return [
        'mark_submit' => [
            'max_attempts' => 20,
            'window_seconds' => 300,
            'message' => 'Slow down a little before leaving another mark.',
        ],
    ];
}

function client_rate_key(string $client_ip): string
{
    return hash('sha256', $client_ip);
}

function clear_old_rate_limits(PDO $pdo): void
{
    $stmt = $pdo->prepare('DELETE FROM rate_limits WHERE created_at < (NOW() - INTERVAL 1 DAY)');
    $stmt->execute();
}

function assert_rate_limit_available(PDO $pdo, string $client_ip, string $action): void
{
    $limits = safety_limits();
    if (!isset($limits[$action])) {
        throw new InvalidArgumentException('Unknown rate limit action.');
    }

    $limit = $limits[$action];
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
        FROM rate_limits
        WHERE client_key = :client_key
            AND action = :action
            AND created_at >= (NOW() - INTERVAL :window_seconds SECOND)'
    );
    $stmt->bindValue(':client_key', client_rate_key($client_ip));
    $stmt->bindValue(':action', $action);
    $stmt->bindValue(':window_seconds', $limit['window_seconds'], PDO::PARAM_INT);
    $stmt->execute();

    if ((int) $stmt->fetchColumn() >= $limit['max_attempts']) {
        throw new RuntimeException($limit['message'], 429);
    }
}

function record_rate_limit_attempt(PDO $pdo, string $client_ip, string $action): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO rate_limits (client_key, action)
        VALUES (:client_key, :action)'
    );
    $stmt->execute([
        ':client_key' => client_rate_key($client_ip),
        ':action' => $action,
    ]);
}

function validate_spam_content(array $input): ?string
{
    $display_name = trim($input['display_name'] ?? '');
    $message = trim($input['message'] ?? '');
    $combined = trim($display_name . ' ' . $message);

    if (preg_match_all('/https?:\/\/|www\./i', $combined) > 1) {
        return 'Please keep links to a minimum.';
    }

    if (preg_match('/(.)\1{9,}/u', $combined)) {
        return 'Please avoid repeated character spam.';
    }

    if ($message !== '') {
        $letters = preg_replace('/[^a-z0-9]/i', '', $message);
        if (strlen($letters) >= 20 && preg_match('/^[A-Z0-9]+$/', $letters)) {
            return 'Please avoid all-caps spam.';
        }
    }

    return null;
}
