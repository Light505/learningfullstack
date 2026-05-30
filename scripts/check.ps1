param(
    [string] $ComposeCommand = "docker compose",
    [switch] $WithDatabase
)

$ErrorActionPreference = "Stop"

Write-Host "Checking PHP syntax..."
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot "..\src") -Recurse -Filter "*.php" |
    ForEach-Object { php -l $_.FullName }

Write-Host "Running validation tests..."
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot "..\tests") -Filter "*validation_test.php" |
    Sort-Object Name |
    ForEach-Object { php $_.FullName }

if ($WithDatabase) {
    Write-Host "Running database tests in the web container..."
    $composeParts = $ComposeCommand -split "\s+"
    $composeArgs = $composeParts[1..($composeParts.Length - 1)]
    @'
<?php
require_once '/var/www/html/app/config.php';
require_once '/var/www/html/app/database.php';
require_once '/var/www/html/app/marks.php';

$config = app_config();
$pdo = create_pdo($config);
$uid = generate_mark_uid();
$x = null;
$y = null;

for ($attempt = 0; $attempt < 50; $attempt++) {
    $candidateX = random_int(500, 9500) / 100;
    $candidateY = random_int(500, 9500) / 100;

    if (mark_position_available($pdo, $candidateX, $candidateY, mark_limits()['min_distance_percent'])) {
        $x = $candidateX;
        $y = $candidateY;
        break;
    }
}

if ($x === null || $y === null) {
    fwrite(STDERR, "FAIL: could not find an available test position.\n");
    exit(1);
}

$mark = save_mark($pdo, [
    'uid' => $uid,
    'display_name' => 'Repository Test',
    'message' => 'Saved from a container test.',
    'drawing' => '',
    'x_percent' => $x,
    'y_percent' => $y,
    'color' => '#ABCDEF',
    'shape' => 'diamond',
]);

if ($mark['uid'] !== $uid) {
    fwrite(STDERR, "FAIL: saved mark UID mismatch.\n");
    exit(1);
}

if ($mark['color'] !== '#abcdef') {
    fwrite(STDERR, "FAIL: color should be normalized to lowercase.\n");
    exit(1);
}

if (!delete_mark_by_uid($pdo, $uid)) {
    fwrite(STDERR, "FAIL: saved mark could not be deleted.\n");
    exit(1);
}

$uid = generate_mark_uid();
$mark = save_mark($pdo, [
    'uid' => $uid,
    'display_name' => 'Repository Test',
    'message' => 'Saved from a container test.',
    'drawing' => '',
    'x_percent' => $x,
    'y_percent' => $y,
    'color' => '#ABCDEF',
    'shape' => 'diamond',
]);

$found = false;
foreach (recent_marks($pdo, 5) as $recent_mark) {
    if ($recent_mark['uid'] === $uid) {
        $found = true;
        break;
    }
}

if (!$found) {
    fwrite(STDERR, "FAIL: saved mark was not found in recent marks.\n");
    exit(1);
}

try {
    save_mark($pdo, [
        'uid' => generate_mark_uid(),
        'display_name' => 'Overlap Test',
        'message' => 'This should be too close.',
        'drawing' => '',
        'x_percent' => $x + 0.5,
        'y_percent' => $y + 0.5,
        'color' => '#abcdef',
        'shape' => 'circle',
    ]);

    fwrite(STDERR, "FAIL: overlapping mark was accepted.\n");
    exit(1);
} catch (InvalidArgumentException $e) {
    if (strpos($e->getMessage(), 'too close') === false) {
        fwrite(STDERR, "FAIL: overlap test returned unexpected error: {$e->getMessage()}\n");
        exit(1);
    }
}

echo "PASS: mark repository saves and lists marks.\n";
echo "PASS: mark repository deletes marks.\n";
echo "PASS: mark repository rejects overlapping marks.\n";
'@ | & $composeParts[0] @composeArgs exec -T web php
}

Write-Host "Checking Docker Compose config..."
$composeParts = $ComposeCommand -split "\s+"
$composeArgs = $composeParts[1..($composeParts.Length - 1)]
& $composeParts[0] @composeArgs config --quiet

Write-Host "All checks passed."
