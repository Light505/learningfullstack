<?php

require_once __DIR__ . '/../src/app/safety.php';

$valid = [
    'display_name' => 'Lighthal',
    'message' => 'I was here.',
];

$cases = [
    'normal message passes spam validation' => [
        'input' => $valid,
        'expected' => null,
    ],
    'repeated character spam is rejected' => [
        'input' => array_merge($valid, ['message' => 'helloooooooooooooo']),
        'expected' => 'Please avoid repeated character spam.',
    ],
    'too many links are rejected' => [
        'input' => array_merge($valid, ['message' => 'Visit https://example.com and www.example.org']),
        'expected' => 'Please keep links to a minimum.',
    ],
    'all caps spam is rejected' => [
        'input' => array_merge($valid, ['message' => 'THISISWAYTOOLOUDTOLEAVEHERE']),
        'expected' => 'Please avoid all-caps spam.',
    ],
];

$failed = 0;

foreach ($cases as $name => $case) {
    $actual = validate_spam_content($case['input']);

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

echo "All safety validation tests passed.\n";
