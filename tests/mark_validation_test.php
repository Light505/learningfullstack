<?php

require_once __DIR__ . '/../src/app/marks.php';

$limits = mark_limits();

$valid = [
    'display_name' => 'Lighthal',
    'message' => 'I was here.',
    'drawing' => '',
    'x_percent' => 420.5,
    'y_percent' => 610.25,
    'color' => '#f0b35a',
    'shape' => 'circle',
];

$detailed_drawing_strokes = [];
for ($stroke_index = 0; $stroke_index < 12; $stroke_index++) {
    $stroke = [];
    for ($point_index = 0; $point_index < 120; $point_index++) {
        $stroke[] = [
            round(($point_index % 100) + 0.1, 1),
            round(($stroke_index * 2.4) + (($point_index % 9) * 0.1), 1),
        ];
    }
    $detailed_drawing_strokes[] = $stroke;
}
$detailed_drawing = json_encode(['v' => 1, 'strokes' => $detailed_drawing_strokes]);

$too_many_strokes = [];
for ($stroke_index = 0; $stroke_index < 129; $stroke_index++) {
    $too_many_strokes[] = [[10, 10]];
}

$too_many_points = [];
for ($point_index = 0; $point_index < 8193; $point_index++) {
    $too_many_points[] = [10, 10];
}

$cases = [
    'valid mark passes' => [
        'input' => $valid,
        'expected' => null,
    ],
    'display name is required' => [
        'input' => array_merge($valid, ['display_name' => '']),
        'expected' => 'Display name is required.',
    ],
    'message or drawing is required' => [
        'input' => array_merge($valid, ['message' => '', 'drawing' => '']),
        'expected' => 'Leave a message or drawing before placing your mark.',
    ],
    'message max length is checked' => [
        'input' => array_merge($valid, ['message' => str_repeat('a', 281)]),
        'expected' => 'Message must be less than 280 characters.',
    ],
    'expanded x position is allowed' => [
        'input' => array_merge($valid, ['x_percent' => 99000.5]),
        'expected' => null,
    ],
    'negative expanded y position is allowed' => [
        'input' => array_merge($valid, ['y_percent' => -99000.5]),
        'expected' => null,
    ],
    'x position is bounded' => [
        'input' => array_merge($valid, ['x_percent' => 103424]),
        'expected' => 'Mark X position must be within the canvas bounds.',
    ],
    'x position below max is allowed' => [
        'input' => array_merge($valid, ['x_percent' => 103423.99]),
        'expected' => null,
    ],
    'y position is bounded' => [
        'input' => array_merge($valid, ['y_percent' => -102400.5]),
        'expected' => 'Mark Y position must be within the canvas bounds.',
    ],
    'color must be hex' => [
        'input' => array_merge($valid, ['color' => 'amber']),
        'expected' => 'Choose a valid mark color.',
    ],
    'shape must be allowed' => [
        'input' => array_merge($valid, ['shape' => 'star']),
        'expected' => 'Choose a valid mark shape.',
    ],
    'invalid drawing payload is rejected' => [
        'input' => array_merge($valid, ['message' => '', 'drawing' => '{"lines":[]}']),
        'expected' => 'Drawing data is invalid.',
    ],
    'valid drawing can stand in for message' => [
        'input' => array_merge($valid, ['message' => '', 'drawing' => '{"v":1,"strokes":[[{"x":10,"y":10},{"x":30,"y":40}]]}']),
        'expected' => null,
    ],
    'compact drawing points are accepted' => [
        'input' => array_merge($valid, ['message' => '', 'drawing' => '{"v":1,"strokes":[[[10,10],[30,40]]]}']),
        'expected' => null,
    ],
    'sophisticated drawing is accepted' => [
        'input' => array_merge($valid, ['message' => '', 'drawing' => $detailed_drawing]),
        'expected' => null,
    ],
    'drawing size is checked' => [
        'input' => array_merge($valid, ['drawing' => str_repeat('x', 128001)]),
        'expected' => 'Drawing is too large. Please keep it simple.',
    ],
    'drawing stroke count is checked' => [
        'input' => array_merge($valid, ['drawing' => json_encode(['v' => 1, 'strokes' => $too_many_strokes])]),
        'expected' => 'Drawing has too many strokes. Please keep it simple.',
    ],
    'drawing point count is checked' => [
        'input' => array_merge($valid, ['drawing' => json_encode(['v' => 1, 'strokes' => [$too_many_points]])]),
        'expected' => 'Drawing has too many points. Please keep it simple.',
    ],
    'drawing coordinates are bounded' => [
        'input' => array_merge($valid, ['drawing' => '{"v":1,"strokes":[[{"x":101,"y":10}]]}']),
        'expected' => 'Drawing data is invalid.',
    ],
];

$failed = 0;

foreach ($cases as $name => $case) {
    $actual = validate_mark($case['input'], $limits);

    if ($actual !== $case['expected']) {
        $failed++;
        fwrite(STDERR, "FAIL: $name\n");
        fwrite(STDERR, "Expected: " . var_export($case['expected'], true) . "\n");
        fwrite(STDERR, "Actual:   " . var_export($actual, true) . "\n");
        continue;
    }

    echo "PASS: $name\n";
}

$exploration_cases = [
    'first mark can use the origin tile' => [
        'marks' => [],
        'x' => 420.5,
        'y' => 610.25,
        'expected' => true,
    ],
    'first mark cannot jump to a remote tile' => [
        'marks' => [],
        'x' => 99000.5,
        'y' => 610.25,
        'expected' => false,
    ],
    'saved marks reveal neighboring tiles' => [
        'marks' => [['x_percent' => 420.5, 'y_percent' => 610.25]],
        'x' => 1500,
        'y' => 1500,
        'expected' => true,
    ],
    'saved marks do not reveal distant tiles' => [
        'marks' => [['x_percent' => 420.5, 'y_percent' => 610.25]],
        'x' => 4096,
        'y' => 4096,
        'expected' => false,
    ],
];

foreach ($exploration_cases as $name => $case) {
    $actual = mark_coordinate_is_explored($case['x'], $case['y'], $case['marks'], $limits);

    if ($actual !== $case['expected']) {
        $failed++;
        fwrite(STDERR, "FAIL: $name\n");
        fwrite(STDERR, "Expected: " . var_export($case['expected'], true) . "\n");
        fwrite(STDERR, "Actual:   " . var_export($actual, true) . "\n");
        continue;
    }

    echo "PASS: $name\n";
}

if ($failed > 0) {
    exit(1);
}

echo "All mark validation tests passed.\n";
