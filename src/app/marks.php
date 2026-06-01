<?php

function mark_limits(): array
{
    return [
        'max_display_name' => 80,
        'max_message' => 280,
        'max_drawing_bytes' => 128000,
        'max_drawing_strokes' => 128,
        'max_drawing_points' => 8192,
        'allowed_shapes' => ['circle', 'square', 'diamond'],
        'min_distance_percent' => 46.08,
        'min_coordinate_percent' => -102400,
        'max_coordinate_percent' => 103424,
    ];
}

function mark_tile_size(): int
{
    return 1024;
}

function mark_tile_index_for_coordinate(float $coordinate): int
{
    return (int) floor($coordinate / mark_tile_size());
}

function mark_tile_bounds(array $limits): array
{
    return [
        'min' => mark_tile_index_for_coordinate((float) $limits['min_coordinate_percent']),
        'max' => mark_tile_index_for_coordinate((float) $limits['max_coordinate_percent']) - 1,
    ];
}

function mark_tile_key(int $tile_x, int $tile_y): string
{
    return $tile_x . ',' . $tile_y;
}

function explored_tile_keys_for_marks(array $marks, array $limits): array
{
    $bounds = mark_tile_bounds($limits);
    $explored = [mark_tile_key(0, 0) => true];

    foreach ($marks as $mark) {
        if (!isset($mark['x_percent'], $mark['y_percent']) || !is_numeric($mark['x_percent']) || !is_numeric($mark['y_percent'])) {
            continue;
        }

        $tile_x = mark_tile_index_for_coordinate((float) $mark['x_percent']);
        $tile_y = mark_tile_index_for_coordinate((float) $mark['y_percent']);

        for ($dx = -1; $dx <= 1; $dx++) {
            for ($dy = -1; $dy <= 1; $dy++) {
                $neighbor_x = $tile_x + $dx;
                $neighbor_y = $tile_y + $dy;
                if ($neighbor_x >= $bounds['min'] && $neighbor_x <= $bounds['max'] && $neighbor_y >= $bounds['min'] && $neighbor_y <= $bounds['max']) {
                    $explored[mark_tile_key($neighbor_x, $neighbor_y)] = true;
                }
            }
        }
    }

    return $explored;
}

function mark_coordinate_is_explored(float $x_percent, float $y_percent, array $marks, array $limits): bool
{
    $tile_x = mark_tile_index_for_coordinate($x_percent);
    $tile_y = mark_tile_index_for_coordinate($y_percent);
    $explored = explored_tile_keys_for_marks($marks, $limits);

    return isset($explored[mark_tile_key($tile_x, $tile_y)]);
}

function normalize_mark_input(array $input): array
{
    return [
        'uid' => trim($input['uid'] ?? generate_mark_uid()),
        'display_name' => trim($input['display_name'] ?? ''),
        'message' => trim($input['message'] ?? ''),
        'drawing' => trim($input['drawing'] ?? ''),
        'x_percent' => $input['x_percent'] ?? null,
        'y_percent' => $input['y_percent'] ?? null,
        'color' => trim($input['color'] ?? ''),
        'shape' => trim($input['shape'] ?? ''),
    ];
}

function generate_mark_uid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);

    return sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20)
    );
}

function validate_mark(array $input, array $limits): ?string
{
    $input = normalize_mark_input($input);
    $display_name = $input['display_name'];
    $message = $input['message'];
    $drawing = $input['drawing'];
    $color = $input['color'];
    $shape = $input['shape'];
    $x_percent = $input['x_percent'] ?? null;
    $y_percent = $input['y_percent'] ?? null;

    if ($display_name === '') {
        return 'Display name is required.';
    }

    if (strlen($display_name) > $limits['max_display_name']) {
        return 'Display name must be less than ' . $limits['max_display_name'] . ' characters.';
    }

    if ($message === '' && $drawing === '') {
        return 'Leave a message or drawing before placing your mark.';
    }

    if (strlen($message) > $limits['max_message']) {
        return 'Message must be less than ' . $limits['max_message'] . ' characters.';
    }

    $drawing_error = validate_drawing($drawing, $limits);
    if ($drawing_error !== null) {
        return $drawing_error;
    }

    if (!is_numeric($x_percent) || (float) $x_percent < $limits['min_coordinate_percent'] || (float) $x_percent >= $limits['max_coordinate_percent']) {
        return 'Mark X position must be within the canvas bounds.';
    }

    if (!is_numeric($y_percent) || (float) $y_percent < $limits['min_coordinate_percent'] || (float) $y_percent >= $limits['max_coordinate_percent']) {
        return 'Mark Y position must be within the canvas bounds.';
    }

    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
        return 'Choose a valid mark color.';
    }

    if (!in_array($shape, $limits['allowed_shapes'], true)) {
        return 'Choose a valid mark shape.';
    }

    return null;
}

function validate_drawing(string $drawing, array $limits): ?string
{
    if ($drawing === '') {
        return null;
    }

    if ($limits['max_drawing_bytes'] !== null && strlen($drawing) > $limits['max_drawing_bytes']) {
        return 'Drawing is too large. Please keep it simple.';
    }

    $payload = json_decode($drawing, true);
    if (!is_array($payload) || !isset($payload['strokes']) || !is_array($payload['strokes'])) {
        return 'Drawing data is invalid.';
    }

    if ($limits['max_drawing_strokes'] !== null && count($payload['strokes']) > $limits['max_drawing_strokes']) {
        return 'Drawing has too many strokes. Please keep it simple.';
    }

    $point_count = 0;
    foreach ($payload['strokes'] as $stroke) {
        if (!is_array($stroke) || count($stroke) === 0) {
            return 'Drawing data is invalid.';
        }

        foreach ($stroke as $point) {
            if (!is_array($point)) {
                return 'Drawing data is invalid.';
            }

            $uses_numeric_points = array_key_exists(0, $point) || array_key_exists(1, $point);
            $x_value = $uses_numeric_points ? ($point[0] ?? null) : ($point['x'] ?? null);
            $y_value = $uses_numeric_points ? ($point[1] ?? null) : ($point['y'] ?? null);

            if (!is_numeric($x_value) || !is_numeric($y_value)) {
                return 'Drawing data is invalid.';
            }

            $x = (float) $x_value;
            $y = (float) $y_value;
            if ($x < 0 || $x > 100 || $y < 0 || $y > 100) {
                return 'Drawing data is invalid.';
            }

            $point_count++;
        }
    }

    if ($limits['max_drawing_points'] !== null && $point_count > $limits['max_drawing_points']) {
        return 'Drawing has too many points. Please keep it simple.';
    }

    return null;
}

function save_mark(PDO $pdo, array $input): array
{
    $mark = normalize_mark_input($input);
    $limits = mark_limits();
    $error = validate_mark($mark, $limits);
    if ($error !== null) {
        throw new InvalidArgumentException($error);
    }

    if (!mark_coordinate_is_explored((float) $mark['x_percent'], (float) $mark['y_percent'], all_mark_coordinates($pdo), $limits)) {
        throw new InvalidArgumentException('Choose a spot inside the available canvas.');
    }

    if (!mark_position_available(
        $pdo,
        (float) $mark['x_percent'],
        (float) $mark['y_percent'],
        $limits['min_distance_percent']
    )) {
        throw new InvalidArgumentException('That spot is too close to another mark. Choose a little more space.');
    }

    $stmt = $pdo->prepare(
        'INSERT INTO marks
            (uid, x_percent, y_percent, display_name, message, drawing, color, shape)
        VALUES
            (:uid, :x_percent, :y_percent, :display_name, :message, :drawing, :color, :shape)'
    );

    $stmt->execute([
        ':uid' => $mark['uid'],
        ':x_percent' => $mark['x_percent'],
        ':y_percent' => $mark['y_percent'],
        ':display_name' => $mark['display_name'],
        ':message' => $mark['message'] === '' ? null : $mark['message'],
        ':drawing' => $mark['drawing'] === '' ? null : $mark['drawing'],
        ':color' => strtolower($mark['color']),
        ':shape' => $mark['shape'],
    ]);

    return find_mark_by_uid($pdo, $mark['uid']);
}

function mark_position_available(PDO $pdo, float $x_percent, float $y_percent, float $min_distance): bool
{
    $stmt = $pdo->query('SELECT x_percent, y_percent FROM marks');
    $existing_marks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($existing_marks as $mark) {
        $dx = $x_percent - (float) $mark['x_percent'];
        $dy = $y_percent - (float) $mark['y_percent'];
        $distance = sqrt(($dx * $dx) + ($dy * $dy));

        if ($distance < $min_distance) {
            return false;
        }
    }

    return true;
}

function find_mark_by_uid(PDO $pdo, string $uid): array
{
    $stmt = $pdo->prepare(
        'SELECT uid, x_percent, y_percent, display_name, message, drawing, color, shape, created_at
        FROM marks
        WHERE uid = :uid'
    );
    $stmt->execute([':uid' => $uid]);
    $mark = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($mark === false) {
        throw new RuntimeException('Mark not found.');
    }

    return $mark;
}

function delete_mark_by_uid(PDO $pdo, string $uid): bool
{
    $stmt = $pdo->prepare('DELETE FROM marks WHERE uid = :uid');
    $stmt->execute([':uid' => $uid]);

    return $stmt->rowCount() > 0;
}

function recent_marks(PDO $pdo, int $limit = 10): array
{
    $limit = max(1, min($limit, 50));
    $stmt = $pdo->prepare(
        "SELECT uid, x_percent, y_percent, display_name, message, drawing, color, shape, created_at
        FROM marks
        ORDER BY created_at DESC, id DESC
        LIMIT $limit"
    );
    $stmt->execute();

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function mark_uids(PDO $pdo, int $limit = 1000): array
{
    $limit = max(1, min($limit, 1000));
    $stmt = $pdo->prepare(
        "SELECT uid
        FROM marks
        ORDER BY created_at ASC, id ASC
        LIMIT $limit"
    );
    $stmt->execute();

    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

function count_marks(PDO $pdo): int
{
    $stmt = $pdo->query('SELECT COUNT(*) FROM marks');

    return (int) $stmt->fetchColumn();
}

function all_mark_coordinates(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT x_percent, y_percent FROM marks');

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function all_marks(PDO $pdo, int $limit = 500): array
{
    $limit = max(1, min($limit, 1000));
    $stmt = $pdo->prepare(
        "SELECT uid, x_percent, y_percent, display_name, message, drawing, color, shape, created_at
        FROM marks
        ORDER BY created_at ASC, id ASC
        LIMIT $limit"
    );
    $stmt->execute();

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
