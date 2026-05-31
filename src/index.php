<?php
require_once __DIR__ . '/app/security.php';
require_once __DIR__ . '/app/config.php';
require_once __DIR__ . '/app/database.php';
require_once __DIR__ . '/app/marks.php';

session_start();
send_security_headers();
csrf_token();

$config = app_config();
$marks = [];

try {
    $pdo = create_pdo($config);
    $saved_marks = all_marks($pdo);

    $marks = array_map(function (array $mark): array {
        return [
            'uid' => $mark['uid'],
            'name' => $mark['display_name'],
            'message' => $mark['message'] ?? 'A quiet mark without words.',
            'drawing' => $mark['drawing'] ?? '',
            'x' => (float) $mark['x_percent'],
            'y' => (float) $mark['y_percent'],
            'color' => $mark['color'],
            'shape' => $mark['shape'],
            'tone' => 'saved',
            'created' => date('M j, Y g:i A', strtotime($mark['created_at'])),
        ];
    }, $saved_marks);
} catch (Throwable $e) {
    error_log('Failed to load marks: ' . $e->getMessage());
    $marks = [];
}

$marks = array_map(function (array $mark, int $index): array {
    $mark['uid'] = $mark['uid'] ?? 'sample-' . ($index + 1);
    $mark['drawing'] = $mark['drawing'] ?? '';
    return $mark;
}, $marks, array_keys($marks));

$entry_count = count($marks);
$has_marks = $entry_count > 0;
$can_undo = !empty($_SESSION['last_mark_uid']);
$preview_mark = $marks[0] ?? [
    'name' => 'No mark selected',
    'message' => 'Choose an existing mark to preview it here.',
    'drawing' => '',
    'color' => '#f0b35a',
    'created' => 'Waiting for the first mark.',
];
$recent_marks = array_slice(array_reverse($marks), 0, 5);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>I was here.</title>
    <link rel="stylesheet" href="/assets/css/home.css">
    <script src="/assets/js/canvas-prototype.js" defer></script>
</head>
<body>
    <main class="app-shell">
        <section class="workspace" aria-labelledby="page-title">
            <header class="topbar">
                <div>
                    <h1 id="page-title">I was here.</h1>
                    <p class="page-subtitle">A modern equivalent of ancient caves.</p>
                </div>
                <div class="entry-count" aria-label="Current canvas entry count">
                    <span data-entry-count><?= $entry_count ?></span>
                    <small data-entry-count-label>marks on the wall</small>
                </div>
            </header>

            <div class="canvas-layout">
                <section class="canvas-panel" aria-label="Canvas prototype">
                    <div class="canvas-toolbar" aria-label="Canvas tools preview">
                        <div class="toolbar-section placement-tools" aria-label="Placement tools">
                            <button type="button" class="tool-button active" data-place-button>
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                    <path d="M12 21s6-5.33 6-11a6 6 0 0 0-12 0c0 5.67 6 11 6 11Z"></path>
                                    <circle cx="12" cy="10" r="2"></circle>
                                </svg>
                                Place
                            </button>
                            <button type="button" class="tool-button" data-random-button>
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                    <path d="M16 3h5v5"></path>
                                    <path d="M4 20 21 3"></path>
                                    <path d="M21 16v5h-5"></path>
                                    <path d="M15 15 21 21"></path>
                                    <path d="M4 4l5 5"></path>
                                </svg>
                                Random
                            </button>
                        </div>
                        <div class="toolbar-section zoom-controls" aria-label="Canvas view controls">
                            <button type="button" class="icon-button" aria-label="Zoom in" data-zoom-in-button>
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                    <circle cx="11" cy="11" r="7"></circle>
                                    <path d="M11 8v6"></path>
                                    <path d="M8 11h6"></path>
                                    <path d="m16 16 5 5"></path>
                                </svg>
                            </button>
                            <output class="zoom-readout" aria-label="Canvas zoom level" data-zoom-readout>100%</output>
                            <button type="button" class="icon-button" aria-label="Zoom out" data-zoom-out-button>
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                    <circle cx="11" cy="11" r="7"></circle>
                                    <path d="M8 11h6"></path>
                                    <path d="m16 16 5 5"></path>
                                </svg>
                            </button>
                            <button type="button" class="icon-button" aria-label="Reset canvas view" data-reset-view-button>
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                    <path d="M3 12a9 9 0 1 0 3-6.7"></path>
                                    <path d="M3 3v6h6"></path>
                                </svg>
                            </button>
                            <button type="button" class="icon-button" aria-label="Fit whole world" data-fit-world-button>
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                    <path d="M3 9V3h6"></path>
                                    <path d="M21 9V3h-6"></path>
                                    <path d="M3 15v6h6"></path>
                                    <path d="M21 15v6h-6"></path>
                                    <path d="M8 8h8v8H8z"></path>
                                </svg>
                            </button>
                            <button
                                type="button"
                                class="icon-button"
                                aria-label="Focus latest mark"
                                data-focus-latest-button
                                <?= $has_marks ? '' : 'disabled' ?>
                            >
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M12 2v4"></path>
                                    <path d="M12 18v4"></path>
                                    <path d="M2 12h4"></path>
                                    <path d="M18 12h4"></path>
                                </svg>
                            </button>
                        </div>
                        <div class="toolbar-section export-tools" aria-label="World export" hidden>
                            <button type="button" class="tool-button" aria-label="Export whole world" data-export-world-button>
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                    <path d="M12 3v12"></path>
                                    <path d="m7 10 5 5 5-5"></path>
                                    <path d="M5 21h14"></path>
                                </svg>
                                Export
                            </button>
                        </div>
                        <div class="toolbar-section undo-tools" aria-label="Undo latest placed mark">
                            <button
                                type="button"
                                class="tool-button warning"
                                aria-label="Undo latest mark"
                                data-undo-button
                                data-csrf-token="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>"
                                data-last-mark-uid="<?= htmlspecialchars($_SESSION['last_mark_uid'] ?? '', ENT_QUOTES, 'UTF-8') ?>"
                                <?= $can_undo ? '' : 'disabled' ?>
                            >
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                    <path d="M9 14 4 9l5-5"></path>
                                    <path d="M4 9h11a5 5 0 0 1 0 10h-4"></path>
                                </svg>
                                Undo latest mark
                            </button>
                        </div>
                    </div>

                    <div
                        class="mark-canvas <?= $has_marks ? 'has-marks' : '' ?>"
                        aria-label="Canvas with saved marks"
                        data-mark-canvas
                        data-min-distance="<?= htmlspecialchars((string) mark_limits()['min_distance_percent'], ENT_QUOTES, 'UTF-8') ?>"
                        data-min-coordinate="<?= htmlspecialchars((string) mark_limits()['min_coordinate_percent'], ENT_QUOTES, 'UTF-8') ?>"
                        data-max-coordinate="<?= htmlspecialchars((string) mark_limits()['max_coordinate_percent'], ENT_QUOTES, 'UTF-8') ?>"
                    >
                        <div class="canvas-hint" data-canvas-hint>
                            <div>
                                <strong>Move through the wall.</strong>
                                <span>Drag the wall, hold Space while dragging, or use the view controls above.</span>
                            </div>
                            <button type="button" aria-label="Hide canvas note" data-hide-canvas-hint>
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                    <path d="m6 6 12 12"></path>
                                    <path d="m18 6-12 12"></path>
                                </svg>
                            </button>
                        </div>

                        <div class="empty-state" aria-hidden="true">
                            <strong>No marks yet.</strong>
                            <span>The first visitor gets the whole silence.</span>
                        </div>

                        <div class="canvas-world" data-canvas-world>
                            <div class="canvas-tiles" data-canvas-tiles aria-hidden="true"></div>
                            <div class="map-clusters" data-map-clusters aria-label="Clustered marks"></div>

                            <?php foreach ($marks as $index => $mark): ?>
                                <button
                                    type="button"
                                    class="mark-dot <?= htmlspecialchars($mark['shape'], ENT_QUOTES, 'UTF-8') ?>"
                                    style="
                                        --mark-x: <?= htmlspecialchars((string) $mark['x'], ENT_QUOTES, 'UTF-8') ?>%;
                                        --mark-y: <?= htmlspecialchars((string) $mark['y'], ENT_QUOTES, 'UTF-8') ?>%;
                                        --mark-color: <?= htmlspecialchars($mark['color'], ENT_QUOTES, 'UTF-8') ?>;
                                    "
                                    data-uid="<?= htmlspecialchars($mark['uid'], ENT_QUOTES, 'UTF-8') ?>"
                                    data-name="<?= htmlspecialchars($mark['name'], ENT_QUOTES, 'UTF-8') ?>"
                                    data-message="<?= htmlspecialchars($mark['message'], ENT_QUOTES, 'UTF-8') ?>"
                                    data-drawing="<?= htmlspecialchars($mark['drawing'], ENT_QUOTES, 'UTF-8') ?>"
                                    data-created="<?= htmlspecialchars($mark['created'], ENT_QUOTES, 'UTF-8') ?>"
                                    data-x="<?= htmlspecialchars((string) $mark['x'], ENT_QUOTES, 'UTF-8') ?>"
                                    data-y="<?= htmlspecialchars((string) $mark['y'], ENT_QUOTES, 'UTF-8') ?>"
                                    aria-label="View <?= htmlspecialchars($mark['tone'], ENT_QUOTES, 'UTF-8') ?> <?= htmlspecialchars($mark['shape'], ENT_QUOTES, 'UTF-8') ?> mark by <?= htmlspecialchars($mark['name'], ENT_QUOTES, 'UTF-8') ?>"
                                    <?= $index === 0 ? 'data-selected="true"' : '' ?>
                                ></button>
                            <?php endforeach; ?>
                        </div>
                        <div class="placement-marker" data-placement-marker hidden aria-hidden="true"></div>
                        <div class="mark-popout" data-mark-popout hidden>
                            <div class="preview-chip" data-preview-chip style="background: <?= htmlspecialchars($preview_mark['color'], ENT_QUOTES, 'UTF-8') ?>" aria-hidden="true"></div>
                            <div class="mark-popout-body">
                                <h2 data-preview-name><?= htmlspecialchars($preview_mark['name'], ENT_QUOTES, 'UTF-8') ?></h2>
                                <p data-preview-message><?= htmlspecialchars($preview_mark['message'], ENT_QUOTES, 'UTF-8') ?></p>
                                <div class="preview-drawing" data-preview-drawing hidden aria-label="Selected mark drawing"></div>
                                <small data-preview-created><?= htmlspecialchars($preview_mark['created'], ENT_QUOTES, 'UTF-8') ?></small>
                            </div>
                        </div>
                    </div>
                </section>

                <aside class="side-panel" aria-label="Mark preview and compose mockup">
                    <section class="compose-preview">
                        <p class="panel-label">Leave a mark</p>
                        <form class="mark-form" data-mark-form>
                            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
                            <input type="hidden" name="x_percent" data-x-field value="">
                            <input type="hidden" name="y_percent" data-y-field value="">
                            <input type="hidden" name="drawing" data-drawing-field value="">
                            <label>
                                <span class="field-label-row">
                                    <span>Display name</span>
                                    <small><span data-count-for="display_name">0</span>/80</small>
                                </span>
                                <input type="text" name="display_name" maxlength="80" placeholder="Future visitor" required data-count-input="display_name">
                            </label>
                            <label>
                                <span class="field-label-row">
                                    <span>Short message</span>
                                    <small><span data-count-for="message">0</span>/280</small>
                                </span>
                                <textarea name="message" maxlength="280" placeholder="I was here." data-count-input="message"></textarea>
                            </label>
                            <div class="drawing-tool">
                                <div class="drawing-tool-header">
                                    <span>Drawing</span>
                                    <div class="drawing-actions" aria-label="Drawing controls">
                                        <button type="button" class="mini-button active" data-drawing-pen>Draw</button>
                                        <button type="button" class="mini-button" data-drawing-eraser>Erase</button>
                                        <button type="button" class="mini-button" data-drawing-undo disabled>Undo</button>
                                    </div>
                                </div>
                                <div class="drawing-pad">
                                    <canvas
                                        class="drawing-canvas"
                                        width="240"
                                        height="120"
                                        data-drawing-canvas
                                        aria-label="Optional drawing pad"
                                    ></canvas>
                                    <span class="drawing-eraser-indicator" data-drawing-eraser-indicator hidden></span>
                                </div>
                                <div class="drawing-clear-row">
                                    <button type="button" class="mini-button danger" data-drawing-clear>Clear drawing</button>
                                </div>
                            </div>
                            <fieldset>
                                <legend>Mark color</legend>
                                <label class="swatch-option">
                                    <input type="radio" name="color" value="#d9826b" checked>
                                    <span class="swatch clay"></span>
                                </label>
                                <label class="swatch-option">
                                    <input type="radio" name="color" value="#9fc5a8">
                                    <span class="swatch moss"></span>
                                </label>
                                <label class="swatch-option">
                                    <input type="radio" name="color" value="#86a6c9">
                                    <span class="swatch dusk"></span>
                                </label>
                                <label class="swatch-option">
                                    <input type="radio" name="color" value="#f0b35a">
                                    <span class="swatch ember"></span>
                                </label>
                            </fieldset>
                            <fieldset class="shape-picker">
                                <legend>Shape</legend>
                                <label class="shape-option" title="Circle">
                                    <input type="radio" name="shape" value="circle" checked>
                                    <span class="shape-icon circle" aria-hidden="true"></span>
                                    <span class="sr-only">Circle</span>
                                </label>
                                <label class="shape-option" title="Square">
                                    <input type="radio" name="shape" value="square">
                                    <span class="shape-icon square" aria-hidden="true"></span>
                                    <span class="sr-only">Square</span>
                                </label>
                                <label class="shape-option" title="Diamond">
                                    <input type="radio" name="shape" value="diamond">
                                    <span class="shape-icon diamond" aria-hidden="true"></span>
                                    <span class="sr-only">Diamond</span>
                                </label>
                            </fieldset>
                            <button type="submit" class="submit-preview" disabled data-submit-button>Choose a spot first</button>
                            <p class="prototype-note" data-placement-note>Click an open spot on the wall, or use Random.</p>
                            <p class="form-status" data-form-status role="status"></p>
                        </form>
                    </section>

                </aside>

                <section class="recent-preview" aria-labelledby="recent-title">
                    <div class="section-heading">
                        <p class="panel-label">Recent marks</p>
                    </div>
                    <ol id="recent-title" class="recent-list" aria-label="Recent marks" data-recent-list>
                        <?php if (count($recent_marks) === 0): ?>
                            <li class="recent-empty">No recent marks yet.</li>
                        <?php endif; ?>
                        <?php foreach ($recent_marks as $mark): ?>
                            <li>
                                <button type="button" class="recent-mark-button" data-recent-uid="<?= htmlspecialchars($mark['uid'], ENT_QUOTES, 'UTF-8') ?>">
                                    <span class="recent-dot <?= htmlspecialchars($mark['shape'], ENT_QUOTES, 'UTF-8') ?>" style="--mark-color: <?= htmlspecialchars($mark['color'], ENT_QUOTES, 'UTF-8') ?>"></span>
                                    <span>
                                        <strong><?= htmlspecialchars($mark['name'], ENT_QUOTES, 'UTF-8') ?></strong>
                                        <p><?= htmlspecialchars($mark['message'], ENT_QUOTES, 'UTF-8') ?></p>
                                        <small><?= htmlspecialchars($mark['created'], ENT_QUOTES, 'UTF-8') ?></small>
                                    </span>
                                </button>
                            </li>
                        <?php endforeach; ?>
                    </ol>
                </section>
            </div>
        </section>
        <div class="mark-toast-region" aria-live="polite" aria-label="New mark notifications" data-toast-region></div>
    </main>
</body>
</html>
