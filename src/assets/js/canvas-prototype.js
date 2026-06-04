let marks = Array.from(document.querySelectorAll(".mark-dot"));
const previewChip = document.querySelector(".preview-chip");
const previewName = document.querySelector("[data-preview-name]");
const previewMessage = document.querySelector("[data-preview-message]");
const previewDrawing = document.querySelector("[data-preview-drawing]");
const previewCreated = document.querySelector("[data-preview-created]");
const markPopout = document.querySelector("[data-mark-popout]");
const canvas = document.querySelector("[data-mark-canvas]");
const canvasHint = document.querySelector("[data-canvas-hint]");
const hideCanvasHint = document.querySelector("[data-hide-canvas-hint]");
const canvasWorld = document.querySelector("[data-canvas-world]");
const canvasTiles = document.querySelector("[data-canvas-tiles]");
const fogCanvas = document.querySelector("[data-fog-canvas]");
const mapClusters = document.querySelector("[data-map-clusters]");
const form = document.querySelector("[data-mark-form]");
const xField = document.querySelector("[data-x-field]");
const yField = document.querySelector("[data-y-field]");
const drawingField = document.querySelector("[data-drawing-field]");
const drawingCanvas = document.querySelector("[data-drawing-canvas]");
const drawingClear = document.querySelector("[data-drawing-clear]");
const drawingUndo = document.querySelector("[data-drawing-undo]");
const drawingPen = document.querySelector("[data-drawing-pen]");
const drawingEraser = document.querySelector("[data-drawing-eraser]");
const drawingEraserIndicator = document.querySelector("[data-drawing-eraser-indicator]");
const colorInputs = Array.from(document.querySelectorAll('input[name="color"]'));
const shapeInputs = Array.from(document.querySelectorAll('input[name="shape"]'));
const countedInputs = Array.from(document.querySelectorAll("[data-count-input]"));
const placementNote = document.querySelector("[data-placement-note]");
const formStatus = document.querySelector("[data-form-status]");
const placeButton = document.querySelector("[data-place-button]");
const randomButton = document.querySelector("[data-random-button]");
const zoomInButton = document.querySelector("[data-zoom-in-button]");
const zoomOutButton = document.querySelector("[data-zoom-out-button]");
const zoomReadout = document.querySelector("[data-zoom-readout]");
const resetViewButton = document.querySelector("[data-reset-view-button]");
const fitWorldButton = document.querySelector("[data-fit-world-button]");
const exportWorldButton = document.querySelector("[data-export-world-button]");
const exportTools = exportWorldButton?.closest(".export-tools");
const focusLatestButton = document.querySelector("[data-focus-latest-button]");
const undoButton = document.querySelector("[data-undo-button]");
const placementMarker = document.querySelector("[data-placement-marker]");
const submitButton = document.querySelector("[data-submit-button]");
const entryCount = document.querySelector("[data-entry-count]");
const entryCountLabel = document.querySelector("[data-entry-count-label]");
const recentTotal = document.querySelector("[data-recent-total]");
const recentList = document.querySelector("[data-recent-list]");
const toastRegion = document.querySelector("[data-toast-region]");
const minDistance = Number.parseFloat(canvas?.dataset.minDistance || "0");
const minCoordinate = Number.parseFloat(canvas?.dataset.minCoordinate || "-102400");
const maxCoordinate = Number.parseFloat(canvas?.dataset.maxCoordinate || "102400");
let drawingStrokes = [];
let activeStroke = null;
let drawingMode = "draw";
let liveSyncReady = false;
let activeTool = "place";
let canvasView = { zoom: 1, panX: 0, panY: 0 };
let leafletMap = null;
let panStart = null;
let keyboardPanActive = false;
let suppressNextCanvasClick = false;
let suppressNextDocumentClick = false;
let fitReturnView = null;
let isFitWorldView = false;
let undoMarkAvailable = Boolean(undoButton?.dataset.lastMarkUid);
let lastWheelZoomAt = 0;
let lastWheelZoomDirection = 0;
const tileSize = 1024;
const minTileIndex = -100;
const maxTileIndex = 100;
const worldMinCoordinate = minTileIndex * tileSize;
const worldMaxCoordinate = (maxTileIndex + 1) * tileSize;
const eraserRadius = 4.5;
const mapModeZoom = 0.32;
const maxCanvasZoom = 2.4;
const zoomStep = 0.2;
const wheelZoomCooldown = 260;
const zoomSnapTolerance = 0.001;
const zoomStopDuplicateTolerance = zoomSnapTolerance * 1.5;
const tileViewStopCounts = [3, 7, 13];
const maxTileOverviewStopCount = 25;
const worldViewStopFractions = [0.25, 0.5, 1];
const clusterVisualCollisionPx = 72;
const clusterZoomFeelMultipliers = {
    supercluster: 1.592,
    galaxy: 1.536,
    system: 1.422,
    neighbor: 1.328,
};

function clusterZoomForRadius(radius, multiplier = 1) {
    return Number(((clusterVisualCollisionPx / radius) * multiplier).toFixed(4));
}

const clusterLevels = [
    { key: "supercluster", label: "supercluster", radius: tileSize * 16, padding: 120 },
    { key: "galaxy", label: "galaxy cluster", radius: tileSize * 6, padding: 108 },
    { key: "system", label: "system cluster", radius: tileSize * 2, padding: 96 },
    { key: "neighbor", label: "neighbor cluster", radius: tileSize * 0.55, padding: 84 },
].map((level) => ({
    ...level,
    maxZoom: clusterZoomForRadius(level.radius, clusterZoomFeelMultipliers[level.key]),
}));
const clusterZoomThresholds = {
    supercluster: clusterLevels[0].maxZoom,
    galaxy: clusterLevels[1].maxZoom,
    system: clusterLevels[2].maxZoom,
    neighbor: clusterLevels[3].maxZoom,
};
const clusterClickZoomMargin = 0.0008;
const manualClusterOpenTiming = {
    camera: 500,
    settle: 380,
};
const recentClusterOpenTiming = {
    world: 360,
    camera: 320,
    settle: 170,
    finalFocus: 360,
};
const fullTileKeys = new Set();
for (let tileX = minTileIndex; tileX <= maxTileIndex; tileX += 1) {
    for (let tileY = minTileIndex; tileY <= maxTileIndex; tileY += 1) {
        fullTileKeys.add(`${tileX},${tileY}`);
    }
}
const exploredTiles = new Set(["0,0"]);
const maxDetailedTileRenderCount = 400;
const tileRenderBuffer = 2;
const tileUnloadBuffer = 3;
const markRenderBuffer = 2;

function snapGridDivisionForZoom(zoom) {
    if (zoom >= 0.9) return 1;
    if (zoom >= 0.6) return 3;
    if (zoom >= 0.3) return 5;
    if (zoom >= 0.15) return 7;
    if (zoom >= 0.08) return 9;
    if (zoom >= 0.04) return 11;
    if (zoom >= 0.015) return 13;
    return 0;
}

function gridSnappedCanvasView(zoom, view = canvasView) {
    const gridDivision = snapGridDivisionForZoom(zoom);
    if (gridDivision === 1) {
        return tileSnappedCanvasView(zoom, view);
    }
    if (gridDivision === 0) {
        return { ...view, zoom };
    }

    const rect = canvas.getBoundingClientRect();
    const config = getInputConfig();
    const center = viewportCenterCoordinate(view);
    const tile = nearestVisibleTileToCoordinate(center.x, center.y);
    const tileCenter = tileCenterCoordinate(tile.tileX, tile.tileY);

    const tileFraction = 1 / gridDivision;
    const viewportWidthWorld = rect.width / zoom;
    const viewportHeightWorld = rect.height / zoom;
    const halfViewportWidthWorld = viewportWidthWorld / 2;
    const halfViewportHeightWorld = viewportHeightWorld / 2;

    const leftEdgeWorld = center.x - halfViewportWidthWorld;
    const topEdgeWorld = center.y - halfViewportHeightWorld;
    const rightEdgeWorld = center.x + halfViewportWidthWorld;
    const bottomEdgeWorld = center.y + halfViewportHeightWorld;

    const snapToleranceWorld = config.snapTolerance / zoom;
    const tileSizeWorld = tileSize;

    const snapX = (worldX) => {
        const normalizedX = ((worldX % tileSizeWorld) + tileSizeWorld) % tileSizeWorld;
        const gridLineX = Math.round(normalizedX / (tileSizeWorld * tileFraction)) * (tileSizeWorld * tileFraction);
        const tileStartX = worldX - normalizedX;
        return tileStartX + gridLineX;
    };

    const snapY = (worldY) => {
        const normalizedY = ((worldY % tileSizeWorld) + tileSizeWorld) % tileSizeWorld;
        const gridLineY = Math.round(normalizedY / (tileSizeWorld * tileFraction)) * (tileSizeWorld * tileFraction);
        const tileStartY = worldY - normalizedY;
        return tileStartY + gridLineY;
    };

    const snappedLeft = snapX(leftEdgeWorld);
    const snappedTop = snapY(topEdgeWorld);
    const snappedCenterX = snappedLeft + halfViewportWidthWorld;
    const snappedCenterY = snappedTop + halfViewportHeightWorld;

    return centeredCanvasViewForCoordinate(snappedCenterX, snappedCenterY, zoom);
}

function tileSnappedCanvasView(zoom, view = canvasView) {
    const center = viewportCenterCoordinate(view);
    const tile = nearestVisibleTileToCoordinate(center.x, center.y);
    const tileCenter = tileCenterCoordinate(tile.tileX, tile.tileY);

    return centeredCanvasViewForCoordinate(tileCenter.x, tileCenter.y, zoom);
}
let worldBounds = { minX: 0, maxX: tileSize, minY: 0, maxY: tileSize };
let viewAnimation = null;
let geometryDirty = true;
let renderedTileSignature = "";
let renderedFogSignature = "";
let renderedClusterSignature = "";
let committedClusterLevelIndex = null;
let pendingClusterTransition = null;
let previousMarkClusterCenter = new Map();
let clusterCache = [];
let clusterCacheSignature = "";
let persistedClusters = [];
let persistedClusterMemberships = [];
let hasPersistedClusterPayload = false;
let activeClusterExpansion = null;
let recentFocusToken = 0;
let recentFocusSequenceActive = false;
const markPositions = new Map();
const renderedTileElements = new Map();
const renderedMarkUids = new Set();
let canvasHintTimer = null;
const markPreview = document.querySelector(".mark-preview");
let panMomentum = { velocityX: 0, velocityY: 0, lastX: 0, lastY: 0, lastTime: 0 };
let panMomentumAnimation = null;
const momentumConfig = {
    friction: 0.92,
    minVelocity: 0.5,
    maxVelocity: 50,
};
let lastTap = { time: 0, x: 0, y: 0 };
const doubleTapConfig = {
    maxDelay: 300,
    maxDistance: 20,
};
let pinchState = null;
const pinchConfig = {
    minDistance: 20,
};

function isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

const inputConfig = {
    panThreshold: 3,
    clickThreshold: 3,
    doubleTapTimeout: 300,
    doubleTapZoomLevel: 1,
    keyboardPanSpeed: 8,
    arrowPanSpeed: 50,
    touch: {
        panThreshold: 10,
        clickThreshold: 15,
        snapTolerance: 12,
        pinchSensitivity: 1.5,
    },
    desktop: {
        panThreshold: 3,
        clickThreshold: 3,
        snapTolerance: 4,
        pinchSensitivity: 1.0,
    },
};

function getInputConfig() {
    const config = isTouchDevice() ? inputConfig.touch : inputConfig.desktop;
    return {
        ...inputConfig,
        panThreshold: config.panThreshold,
        clickThreshold: config.clickThreshold,
        snapTolerance: config.snapTolerance,
        pinchSensitivity: config.pinchSensitivity,
    };
}

function cancelPanMomentum() {
    if (panMomentumAnimation) {
        window.cancelAnimationFrame(panMomentumAnimation);
        panMomentumAnimation = null;
    }
    panMomentum.velocityX = 0;
    panMomentum.velocityY = 0;
}

function resetPanMomentum() {
    panMomentum.velocityX = 0;
    panMomentum.velocityY = 0;
    panMomentum.lastX = 0;
    panMomentum.lastY = 0;
    panMomentum.lastTime = 0;
}

function updatePanMomentum(clientX, clientY, currentTime) {
    const now = currentTime || performance.now();
    if (panMomentum.lastTime > 0) {
        const dt = Math.max(1, now - panMomentum.lastTime);
        let vx = (clientX - panMomentum.lastX) / dt;
        let vy = (clientY - panMomentum.lastY) / dt;
        const { maxVelocity } = momentumConfig;
        vx = Math.max(-maxVelocity, Math.min(maxVelocity, vx));
        vy = Math.max(-maxVelocity, Math.min(maxVelocity, vy));
        panMomentum.velocityX = vx;
        panMomentum.velocityY = vy;
    }
    panMomentum.lastX = clientX;
    panMomentum.lastY = clientY;
    panMomentum.lastTime = now;
}

function applyPanMomentum() {
    cancelPanMomentum();

    const { friction, minVelocity, maxVelocity, settleThreshold } = momentumConfig;
    let velocityX = panMomentum.velocityX;
    let velocityY = panMomentum.velocityY;

    if (Math.abs(velocityX) < minVelocity && Math.abs(velocityY) < minVelocity) {
        settleCanvasView();
        return;
    }

    const step = () => {
        velocityX *= friction;
        velocityY *= friction;

        if (Math.abs(velocityX) < minVelocity && Math.abs(velocityY) < minVelocity) {
            panMomentumAnimation = null;
            settleCanvasView();
            return;
        }

        const { minPanX, maxPanX, minPanY, maxPanY } = canvasPanBounds();
        canvasView.panX = rubberbandPan(canvasView.panX + velocityX, minPanX, maxPanX);
        canvasView.panY = rubberbandPan(canvasView.panY + velocityY, minPanY, maxPanY);
        applyCanvasView({ clamp: false });

        panMomentumAnimation = window.requestAnimationFrame(step);
    };

    panMomentumAnimation = window.requestAnimationFrame(step);
}

function isDoubleTap(event) {
    const now = performance.now();
    const timeDelta = now - lastTap.time;
    if (timeDelta > doubleTapConfig.maxDelay) {
        lastTap.time = now;
        lastTap.x = event.clientX;
        lastTap.y = event.clientY;
        return false;
    }
    const dist = Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y);
    if (dist > doubleTapConfig.maxDistance) {
        lastTap.time = now;
        lastTap.x = event.clientX;
        lastTap.y = event.clientY;
        return false;
    }
    lastTap.time = 0;
    return true;
}

function getPinchStateFromTouches(touches) {
    if (touches.length < 2) {
        return null;
    }
    const t0 = touches[0];
    const t1 = touches[1];
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;
    const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    return { t0, t1, midX, midY, dist };
}

function handlePinchStart(touches) {
    if (leafletMap) {
        return;
    }
    const pinch = getPinchStateFromTouches(touches);
    if (!pinch) {
        return;
    }
    cancelCanvasViewAnimation();
    cancelPanMomentum();
    resetPanMomentum();
    pinchState = {
        startDist: pinch.dist,
        startZoom: canvasView.zoom,
        midX: pinch.midX,
        midY: pinch.midY,
    };
}

function handlePinchMove(touches) {
    if (!pinchState || leafletMap) {
        return;
    }
    const pinch = getPinchStateFromTouches(touches);
    if (!pinch) {
        return;
    }
    const scale = pinch.dist / pinchState.startDist;
    const config = getInputConfig();
    const adjustedScale = Math.pow(scale, config.pinchSensitivity);
    const newZoom = clampZoom(pinchState.startZoom * adjustedScale);
    const rect = canvas.getBoundingClientRect();
    const origin = {
        x: pinch.midX - rect.left,
        y: pinch.midY - rect.top,
    };
    const worldX = (origin.x - canvasView.panX) / canvasView.zoom;
    const worldY = (origin.y - canvasView.panY) / canvasView.zoom;
    canvasView.zoom = newZoom;
    canvasView.panX = origin.x - (worldX * newZoom);
    canvasView.panY = origin.y - (worldY * newZoom);
    applyCanvasView({ clamp: false });
    leaveFitWorldMode();
}

function handlePinchEnd() {
    if (!pinchState) {
        return;
    }
    pinchState = null;
    settleCanvasView();
}

function setActiveTool(activeButton) {
    [placeButton, randomButton].forEach((button) => {
        if (button) {
            button.classList.toggle("active", button === activeButton);
        }
    });

    activeTool = "place";
    if (canvas) {
        canvas.dataset.tool = activeTool;
    }
}

function clampCanvasView() {
    if (!canvas) {
        return;
    }

    canvasView = clampedCanvasView(canvasView);
}

function canvasPanBounds() {
    if (!canvas) {
        return { minPanX: 0, maxPanX: 0, minPanY: 0, maxPanY: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const worldWidth = worldBounds.maxX - worldBounds.minX;
    const worldHeight = worldBounds.maxY - worldBounds.minY;
    const scaledWorldWidth = worldWidth * canvasView.zoom;
    const scaledWorldHeight = worldHeight * canvasView.zoom;

    if (scaledWorldWidth <= rect.width && scaledWorldHeight <= rect.height) {
        return {
            minPanX: (rect.width - scaledWorldWidth) / 2,
            maxPanX: (rect.width - scaledWorldWidth) / 2,
            minPanY: (rect.height - scaledWorldHeight) / 2,
            maxPanY: (rect.height - scaledWorldHeight) / 2,
        };
    }

    return {
        minPanX: Math.min(0, rect.width - scaledWorldWidth),
        maxPanX: 0,
        minPanY: Math.min(0, rect.height - scaledWorldHeight),
        maxPanY: 0,
    };
}

function clampedCanvasView(view) {
    const { minPanX, maxPanX, minPanY, maxPanY } = canvasPanBounds();

    return {
        ...view,
        panX: Math.max(minPanX, Math.min(maxPanX, view.panX)),
        panY: Math.max(minPanY, Math.min(maxPanY, view.panY)),
    };
}

function rubberbandPan(value, min, max) {
    if (value < min) {
        return min + ((value - min) * 0.32);
    }

    if (value > max) {
        return max + ((value - max) * 0.32);
    }

    return value;
}

function tileSnapCounts() {
    const counts = [1];
    for (let count = 3; count <= maxTileOverviewStopCount; count += 2) {
        counts.push(count);
    }
    return counts;
}

function zoomSnapStopItems() {
    const fitZoom = fitWorldZoom();
    const singleTileZoom = tileViewZoomForCount(1);
    const quarterWorldZoom = fitZoom / 0.25;
    const maxTileOverviewZoom = tileViewZoomForCount(maxTileOverviewStopCount);
    const overviewBoundaryZoom = Math.max(quarterWorldZoom, maxTileOverviewZoom);
    const tileStops = tileSnapCounts()
        .filter((tileCount) => tileCount !== 1)
        .map((tileCount) => ({
            type: "tile",
            tileCount,
            zoom: tileViewZoomForCount(tileCount),
        }))
        .filter((stop) => stop.zoom > overviewBoundaryZoom + zoomSnapTolerance);
    const worldStops = worldViewStopFractions
        .filter((fraction) => fraction > 0.25)
        .map((fraction) => ({
            type: fraction === 1 ? "world" : "world-fraction",
            fraction,
            zoom: fitZoom / fraction,
        }));
    const overviewStops = overviewBoundaryZoom < singleTileZoom - zoomSnapTolerance
        ? [{ type: "overview", zoom: overviewBoundaryZoom }]
        : [];
    const clusterStops = clusterLevels.map((level) => ({
        type: "cluster",
        level: level.key,
        zoom: level.maxZoom,
    }));

    return [
        { type: "detail", zoom: 1 },
        ...clusterStops,
        { type: "tile", tileCount: 1, zoom: singleTileZoom },
        ...tileStops,
        ...overviewStops,
        ...worldStops,
    ]
        .map((stop) => ({ ...stop, zoom: clampZoom(stop.zoom) }))
        .filter((stop) => stop.zoom >= fitZoom && stop.zoom <= maxCanvasZoom)
        .filter((stop, index, stops) => stops.findIndex((item) => Math.abs(item.zoom - stop.zoom) <= zoomStopDuplicateTolerance) === index)
        .sort((a, b) => b.zoom - a.zoom);
}

function zoomSnapStops() {
    return zoomSnapStopItems().map((stop) => stop.zoom);
}

function zoomSnapStopForZoom(zoom) {
    return zoomSnapStopItems().find((stop) => Math.abs(stop.zoom - zoom) < zoomSnapTolerance);
}

function viewportCenterCoordinate(view = canvasView) {
    if (!canvas) {
        return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const zoom = Math.max(view.zoom, 0.001);

    return {
        x: worldBounds.minX + (((rect.width / 2) - view.panX) / zoom),
        y: worldBounds.minY + (((rect.height / 2) - view.panY) / zoom),
    };
}

function nearestTileIndexForCoordinate(coordinate) {
    return Math.round((coordinate - (tileSize / 2)) / tileSize);
}

function tileCenterCoordinate(tileX, tileY) {
    return {
        x: (tileX * tileSize) + (tileSize / 2),
        y: (tileY * tileSize) + (tileSize / 2),
    };
}

function nearestVisibleTileToCoordinate(x, y) {
    return {
        tileX: Math.max(minTileIndex, Math.min(maxTileIndex, nearestTileIndexForCoordinate(x))),
        tileY: Math.max(minTileIndex, Math.min(maxTileIndex, nearestTileIndexForCoordinate(y))),
    };
}

function centeredCanvasViewForCoordinate(x, y, zoom) {
    const rect = canvas.getBoundingClientRect();

    return {
        zoom,
        panX: (rect.width / 2) - ((x - worldBounds.minX) * zoom),
        panY: (rect.height / 2) - ((y - worldBounds.minY) * zoom),
    };
}

function canvasViewsMatch(firstView, secondView) {
    return Math.abs(firstView.zoom - secondView.zoom) < zoomSnapTolerance
        && Math.abs(firstView.panX - secondView.panX) < 0.5
        && Math.abs(firstView.panY - secondView.panY) < 0.5;
}

function updateWorldBounds() {
    worldBounds = {
        minX: minTileIndex * tileSize,
        maxX: (maxTileIndex + 1) * tileSize,
        minY: minTileIndex * tileSize,
        maxY: (maxTileIndex + 1) * tileSize,
    };
}

function revealTileAndNeighbors(tileX, tileY) {
    for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
            const nx = tileX + dx;
            const ny = tileY + dy;
            if (nx >= minTileIndex && nx <= maxTileIndex && ny >= minTileIndex && ny <= maxTileIndex) {
                exploredTiles.add(`${nx},${ny}`);
            }
        }
    }
}

function revealExploredNeighbors(tileX, tileY) {
    revealTileAndNeighbors(tileX, tileY);
}

function commitTile(tileX, tileY) {
    exploredTiles.add(`${tileX},${tileY}`);
}

function commitTileBandForCoordinate(x, y) {
    const tileX = Math.floor(x / tileSize);
    const tileY = Math.floor(y / tileSize);

    revealTileAndNeighbors(tileX, tileY);
}

function visibleTileKeys() {
    if (!canvas) {
        return new Set();
    }

    const { minTileX, maxTileX, minTileY, maxTileY } = tileRangeForWorldBounds(visibleWorldBounds());
    const visibleTileCount = (maxTileX - minTileX + 1) * (maxTileY - minTileY + 1);

    const tiles = new Set();
    if (visibleTileCount > maxDetailedTileRenderCount) {
        exploredTiles.forEach((key) => {
            const [tileX, tileY] = key.split(",").map(Number);
            for (let dx = -1; dx <= 1; dx += 1) {
                for (let dy = -1; dy <= 1; dy += 1) {
                    const nx = tileX + dx;
                    const ny = tileY + dy;
                    const neighborKey = `${nx},${ny}`;
                    if (nx >= minTileX && nx <= maxTileX
                        && ny >= minTileY && ny <= maxTileY
                        && fullTileKeys.has(neighborKey)) {
                        tiles.add(neighborKey);
                    }
                }
            }
        });

        return tiles;
    }

    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
            const key = `${tileX},${tileY}`;
            if (fullTileKeys.has(key)) {
                tiles.add(key);
            }
        }
    }

    return tiles;
}

function tileRangeForWorldBounds(bounds, buffer = 0) {
    return {
        minTileX: Math.max(minTileIndex, Math.floor(bounds.minX / tileSize) - buffer),
        maxTileX: Math.min(maxTileIndex, Math.floor(bounds.maxX / tileSize) + buffer),
        minTileY: Math.max(minTileIndex, Math.floor(bounds.minY / tileSize) - buffer),
        maxTileY: Math.min(maxTileIndex, Math.floor(bounds.maxY / tileSize) + buffer),
    };
}

function tileKeyInRange(key, range) {
    const [tileX, tileY] = key.split(",").map(Number);

    return tileX >= range.minTileX && tileX <= range.maxTileX
        && tileY >= range.minTileY && tileY <= range.maxTileY;
}

function tileKeysForRange(range) {
    const keys = [];

    for (let tileY = range.minTileY; tileY <= range.maxTileY; tileY += 1) {
        for (let tileX = range.minTileX; tileX <= range.maxTileX; tileX += 1) {
            const key = `${tileX},${tileY}`;
            if (fullTileKeys.has(key)) {
                keys.push(key);
            }
        }
    }

    return keys;
}

function tileClassName(tileX, tileY) {
    return isExploredTile(tileX, tileY)
        ? "canvas-tile is-committed"
        : "canvas-tile is-unavailable is-fog";
}

function positionTileElement(tile, tileX, tileY) {
    tile.style.setProperty("--tile-left", `${tileX * tileSize - worldBounds.minX}px`);
    tile.style.setProperty("--tile-top", `${tileY * tileSize - worldBounds.minY}px`);
    tile.style.setProperty("--tile-width", `${tileSize}px`);
    tile.style.setProperty("--tile-height", `${tileSize}px`);
    tile.style.setProperty("--tile-bg-x", `${-(tileX * tileSize)}px`);
    tile.style.setProperty("--tile-bg-y", `${-(tileY * tileSize)}px`);
    tile.style.setProperty("--tile-shade", `${Math.abs((tileX * 17) + (tileY * 31)) % 7}`);
}

function updateTileElement(tile, key) {
    const [tileX, tileY] = key.split(",").map(Number);
    const nextClassName = tileClassName(tileX, tileY);

    if (tile.className !== nextClassName) {
        tile.className = nextClassName;
    }

    positionTileElement(tile, tileX, tileY);
}

function createTileElement(key) {
    const tile = document.createElement("span");

    tile.dataset.tileKey = key;
    updateTileElement(tile, key);

    return tile;
}

function clearRenderedTileCache() {
    renderedTileElements.clear();
    renderedTileSignature = "";
    if (canvasTiles) {
        canvasTiles.innerHTML = "";
    }
}

function isExploredTile(tileX, tileY) {
    return exploredTiles.has(`${tileX},${tileY}`);
}

function tileKeyForCoordinate(x, y) {
    return `${Math.floor(x / tileSize)},${Math.floor(y / tileSize)}`;
}

function isExploredCoordinate(x, y) {
    return exploredTiles.has(tileKeyForCoordinate(x, y));
}

function isPlaceableCoordinate(x, y) {
    return isExploredCoordinate(x, y);
}

function isTileInsideCoordinateBounds(tileX, tileY) {
    const tileLeft = tileX * tileSize;
    const tileTop = tileY * tileSize;
    const tileRight = tileLeft + tileSize;
    const tileBottom = tileTop + tileSize;

    return tileLeft >= minCoordinate
        && tileTop >= minCoordinate
        && tileRight <= maxCoordinate
        && tileBottom <= maxCoordinate;
}

function isPlaceableTile(tileX, tileY) {
    return exploredTiles.has(`${tileX},${tileY}`) && isTileInsideCoordinateBounds(tileX, tileY);
}

function randomCoordinateInExploredTiles() {
    const tileKeys = Array.from(exploredTiles).filter((key) => {
        const [tileX, tileY] = key.split(",").map(Number);

        return isTileInsideCoordinateBounds(tileX, tileY);
    });
    const [tileX, tileY] = tileKeys[Math.floor(Math.random() * tileKeys.length)].split(",").map(Number);

    return {
        x: (tileX * tileSize) + (Math.random() * tileSize),
        y: (tileY * tileSize) + (Math.random() * tileSize),
    };
}

function renderCanvasTiles() {
    if (!canvasTiles) {
        return;
    }

    const visibleBounds = visibleWorldBounds();
    const visibleRange = tileRangeForWorldBounds(visibleBounds);
    const visibleTileCount = (visibleRange.maxTileX - visibleRange.minTileX + 1)
        * (visibleRange.maxTileY - visibleRange.minTileY + 1);
    const useViewportCulling = visibleTileCount <= maxDetailedTileRenderCount;
    const renderRange = tileRangeForWorldBounds(visibleBounds, tileRenderBuffer);
    const unloadRange = tileRangeForWorldBounds(visibleBounds, tileUnloadBuffer);
    const renderTileKeys = useViewportCulling
        ? tileKeysForRange(renderRange)
        : Array.from(visibleTileKeys()).sort();
    const renderTileSet = new Set(renderTileKeys);

    if (canvas) {
        canvas.dataset.tileCulling = useViewportCulling ? "viewport" : "overview";
    }

    const tileSignature = [
        useViewportCulling ? "viewport" : "overview",
        Array.from(exploredTiles).sort().join("|"),
        renderTileKeys.join("|"),
        worldBounds.minX,
        worldBounds.minY,
    ].join("::");
    if (tileSignature === renderedTileSignature) {
        return;
    }

    renderedTileSignature = tileSignature;
    const fragment = document.createDocumentFragment();

    renderedTileElements.forEach((tile, key) => {
        if (useViewportCulling ? !tileKeyInRange(key, unloadRange) : !renderTileSet.has(key)) {
            tile.remove();
            renderedTileElements.delete(key);
            return;
        }

        updateTileElement(tile, key);
    });

    renderTileKeys.forEach((key) => {
        if (renderedTileElements.has(key)) {
            return;
        }

        const tile = createTileElement(key);
        renderedTileElements.set(key, tile);
        fragment.appendChild(tile);
    });

    if (fragment.childNodes.length > 0) {
        canvasTiles.appendChild(fragment);
    }
}

function renderFogCanvas(renderMode) {
    if (!fogCanvas) {
        return;
    }

    if (renderMode === "detail") {
        renderedFogSignature = "detail";
        return;
    }

    const worldWidth = worldBounds.maxX - worldBounds.minX;
    const worldHeight = worldBounds.maxY - worldBounds.minY;
    const exploredSignature = Array.from(exploredTiles).sort().join("|");
    const signature = [
        renderMode,
        worldBounds.minX,
        worldBounds.minY,
        worldWidth,
        worldHeight,
        exploredSignature,
    ].join("::");
    if (signature === renderedFogSignature) {
        return;
    }

    renderedFogSignature = signature;

    const maxFogPixels = renderMode === "map" ? 4096 : 3072;
    const fogScale = Math.min(1, maxFogPixels / Math.max(worldWidth, worldHeight));
    const fogWidth = Math.max(1, Math.ceil(worldWidth * fogScale));
    const fogHeight = Math.max(1, Math.ceil(worldHeight * fogScale));

    if (fogCanvas.width !== fogWidth) {
        fogCanvas.width = fogWidth;
    }
    if (fogCanvas.height !== fogHeight) {
        fogCanvas.height = fogHeight;
    }

    const context = fogCanvas.getContext("2d");
    context.clearRect(0, 0, fogWidth, fogHeight);
    context.fillStyle = renderMode === "map"
        ? "rgba(21, 29, 35, 0.82)"
        : "rgba(29, 35, 38, 0.7)";
    context.fillRect(0, 0, fogWidth, fogHeight);

    const fogGradient = context.createLinearGradient(0, 0, fogWidth, fogHeight);
    fogGradient.addColorStop(0, "rgba(255, 255, 255, 0.08)");
    fogGradient.addColorStop(0.5, "rgba(40, 52, 58, 0.18)");
    fogGradient.addColorStop(1, "rgba(0, 0, 0, 0.22)");
    context.fillStyle = fogGradient;
    context.fillRect(0, 0, fogWidth, fogHeight);

    context.save();
    context.globalCompositeOperation = "destination-out";
    Array.from(exploredTiles).forEach((key) => {
        const [tileX, tileY] = key.split(",").map(Number);
        const x = ((tileX * tileSize) - worldBounds.minX) * fogScale;
        const y = ((tileY * tileSize) - worldBounds.minY) * fogScale;
        const size = tileSize * fogScale;

        context.fillStyle = "rgba(0, 0, 0, 0.32)";
        context.fillRect(x - (size * 0.18), y - (size * 0.18), size * 1.36, size * 1.36);
        context.fillStyle = "rgba(0, 0, 0, 0.96)";
        context.fillRect(x, y, size, size);
    });
    context.restore();

    context.globalCompositeOperation = "source-over";
    context.fillStyle = renderMode === "map"
        ? "rgba(232, 243, 244, 0.08)"
        : "rgba(232, 243, 244, 0.05)";
    const step = renderMode === "map" ? 24 : 18;
    for (let x = 0; x < fogWidth; x += step) {
        context.fillRect(x, 0, 1, fogHeight);
    }
    for (let y = 0; y < fogHeight; y += step) {
        context.fillRect(0, y, fogWidth, 1);
    }

    context.fillStyle = "rgba(6, 12, 16, 0.12)";
    for (let y = 0; y < fogHeight; y += 7) {
        const offset = (y * 13) % 31;
        context.fillRect(offset, y, fogWidth - offset, 1);
    }
}

function markToClusterItem(mark) {
    const x = Number.parseFloat(mark.dataset.x || "0");
    const y = Number.parseFloat(mark.dataset.y || "0");

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    return { uid: mark.dataset.uid, mark, x, y };
}

function markClusterItems() {
    return marks.map(markToClusterItem).filter(Boolean);
}

function markClusterItemsForDrilldown() {
    const items = markClusterItems();
    return items;
}

function viewportWorldBounds(margin = 0) {
    if (!canvas) {
        return null;
    }

    const rect = canvas.getBoundingClientRect();
    const vpMinX = worldBounds.minX + ((margin - canvasView.panX) / canvasView.zoom);
    const vpMaxX = worldBounds.minX + ((rect.width - margin - canvasView.panX) / canvasView.zoom);
    const vpMinY = worldBounds.minY + ((margin - canvasView.panY) / canvasView.zoom);
    const vpMaxY = worldBounds.minY + ((rect.height - margin - canvasView.panY) / canvasView.zoom);

    return { minX: vpMinX, maxX: vpMaxX, minY: vpMinY, maxY: vpMaxY };
}

function isMarkInsideViewport(x, y) {
    const margin = -tileSize;
    const bounds = viewportWorldBounds(margin);
    if (!bounds) {
        return true;
    }

    return x >= bounds.minX && x <= bounds.maxX
        && y >= bounds.minY && y <= bounds.maxY;
}

function averageLocation(items) {
    let xTotal = 0;
    let yTotal = 0;

    items.forEach((item) => {
        xTotal += item.x;
        yTotal += item.y;
    });

    const total = items.length || 1;
    return { x: xTotal / total, y: yTotal / total };
}

function boundsForMarks(markElements) {
    return markElements.reduce((bounds, mark) => {
        const x = Number.parseFloat(mark.dataset.x || "0");
        const y = Number.parseFloat(mark.dataset.y || "0");
        return {
            minX: Math.min(bounds.minX, x),
            maxX: Math.max(bounds.maxX, x),
            minY: Math.min(bounds.minY, y),
            maxY: Math.max(bounds.maxY, y),
        };
    }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function stableClusterId(members) {
    const joined = members.map((member) => member.uid).sort().join("|");
    let hash = 0;
    for (let index = 0; index < joined.length; index += 1) {
        hash = ((hash << 5) - hash + joined.charCodeAt(index)) | 0;
    }

    return `c${(hash >>> 0).toString(36)}-${members.length}`;
}

function makeClusterNode(members, level) {
    const center = averageLocation(members);
    return {
        id: stableClusterId(members),
        x: center.x,
        y: center.y,
        count: members.length,
        marks: members.map((member) => member.mark),
        level: level || null,
    };
}

function clusterMarksForRadius(items, radius) {
    const cell = radius || 1;
    const grid = new Map();
    const cellKey = (cx, cy) => `${cx},${cy}`;

    items.forEach((item) => {
        const cx = Math.floor(item.x / cell);
        const cy = Math.floor(item.y / cell);
        const key = cellKey(cx, cy);
        const bucket = grid.get(key);
        if (bucket) {
            bucket.push(item);
        } else {
            grid.set(key, [item]);
        }
    });

    const parent = new Map();
    const find = (uid) => {
        let p = parent.get(uid);
        while (p !== uid) {
            parent.set(uid, parent.get(p));
            uid = p;
            p = parent.get(uid);
        }
        return uid;
    };
    const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) {
            parent.set(ra, rb);
        }
    };

    items.forEach((item) => {
        parent.set(item.uid, item.uid);
    });

    const checked = new Set();
    items.forEach((seed) => {
        const scx = Math.floor(seed.x / cell);
        const scy = Math.floor(seed.y / cell);

        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                const bucket = grid.get(cellKey(scx + dx, scy + dy));
                if (!bucket) {
                    continue;
                }
                bucket.forEach((candidate) => {
                    const pair = seed.uid < candidate.uid
                        ? `${seed.uid}|${candidate.uid}`
                        : `${candidate.uid}|${seed.uid}`;
                    if (checked.has(pair)) {
                        return;
                    }
                    checked.add(pair);
                    if (Math.hypot(candidate.x - seed.x, candidate.y - seed.y) <= radius) {
                        union(seed.uid, candidate.uid);
                    }
                });
            }
        }
    });

    const groups = new Map();
    items.forEach((item) => {
        const root = find(item.uid);
        const group = groups.get(root);
        if (group) {
            group.push(item);
        } else {
            groups.set(root, [item]);
        }
    });

    return [...groups.values()].map((members) => makeClusterNode(members));
}

function clusterLevelIndexForZoom(zoom) {
    const index = clusterLevels.findIndex((level) => zoom <= level.maxZoom);
    return index === -1 ? clusterLevels.length : index;
}

function clusterLevelIndex() {
    if (committedClusterLevelIndex === null) {
        committedClusterLevelIndex = clusterLevelIndexForZoom(canvasView.zoom);
    }

    return committedClusterLevelIndex;
}

function commitClusterLevelForZoom(zoom, options = {}) {
    const nextLevelIndex = clusterLevelIndexForZoom(zoom);
    const previousLevelIndex = clusterLevelIndex();

    if (nextLevelIndex === previousLevelIndex) {
        return;
    }

    committedClusterLevelIndex = nextLevelIndex;
    pendingClusterTransition = options.animate === false
        ? null
        : {
            from: previousLevelIndex,
            to: nextLevelIndex,
            direction: nextLevelIndex < previousLevelIndex ? "out" : "in",
        };
    clusterCacheSignature = "";
    renderedClusterSignature = "";
}

function activeClusterLevel() {
    return clusterLevels[clusterLevelIndex()] || null;
}

function resetClusterDrilldown() {
    activeClusterExpansion = null;
    pendingClusterTransition = null;
    renderedClusterSignature = "";
}

function clusterSignature() {
    const marksKey = marks
        .map((mark) => `${mark.dataset.uid}:${mark.dataset.x}:${mark.dataset.y}:${mark.style.getPropertyValue("--mark-color")}`)
        .join("|");
    return `${clusterLevelIndex()}|${marksKey}|${persistedClusterSignature()}`;
}

function currentClusters() {
    const signature = clusterSignature();
    if (signature !== clusterCacheSignature) {
        const levelIndex = clusterLevelIndex();
        clusterCacheSignature = signature;

        const items = markClusterItemsForDrilldown();
        const hierarchy = buildFullClusterHierarchy(items);

        let result = null;
        for (let i = levelIndex; i < clusterLevels.length; i += 1) {
            if (hierarchy[i] && hierarchy[i].length > 0) {
                result = hierarchy[i];
                break;
            }
        }
        clusterCache = result || items.map((item) => makeClusterNode([item], "mark"));
    }

    return clusterCache;
}

function buildFullClusterHierarchy(items) {
    if (items.length === 0) {
        return [makeEmptyHierarchy(), makeEmptyHierarchy(), makeEmptyHierarchy(), makeEmptyHierarchy()];
    }

    const sorted = [...items].sort((a, b) => a.uid.localeCompare(b.uid));

    const neighbors = clusterMarksForRadius(sorted, clusterLevels[3].radius)
        .filter((cluster) => cluster.count >= 2)
        .map((n) => ({ ...n, level: "neighbor" }));

    const systemPromotion = promoteChildClusters(neighbors, clusterLevels[2]);
    const galaxyPromotion = promoteChildClusters(systemPromotion.parents, clusterLevels[1]);
    const superPromotion = promoteChildClusters(galaxyPromotion.parents, clusterLevels[0]);

    return [
        [...superPromotion.parents, ...superPromotion.carried, ...galaxyPromotion.carried, ...systemPromotion.carried],
        [...galaxyPromotion.parents, ...galaxyPromotion.carried, ...systemPromotion.carried],
        [...systemPromotion.parents, ...systemPromotion.carried],
        neighbors,
    ];
}

function promoteChildClusters(children, parentLevel) {
    if (children.length === 0) {
        return { parents: [], carried: [] };
    }

    const promotionItems = children.map((cluster) => ({
        uid: cluster.id,
        x: cluster.x,
        y: cluster.y,
        cluster,
    }));
    const groups = groupRawItemsByRadius(promotionItems, parentLevel.radius);
    const parents = [];
    const carried = [];

    groups.forEach((group) => {
        if (group.length < 2) {
            carried.push(group[0].cluster);
            return;
        }

        const allMarks = group.flatMap((item) => item.cluster.marks);
        parents.push({
            ...makeClusterNode(itemsFromMarkElements(allMarks)),
            level: parentLevel.key,
            marks: allMarks,
        });
    });

    return { parents, carried };
}

function buildClusterHierarchy(items) {
    return buildFullClusterHierarchy(items);
}

function groupRawItemsByRadius(items, radius) {
    const cell = radius || 1;
    const grid = new Map();
    const cellKey = (cx, cy) => `${cx},${cy}`;

    items.forEach((item) => {
        const cx = Math.floor(item.x / cell);
        const cy = Math.floor(item.y / cell);
        const key = cellKey(cx, cy);
        const bucket = grid.get(key);
        if (bucket) {
            bucket.push(item);
        } else {
            grid.set(key, [item]);
        }
    });

    const parent = new Map();
    const find = (uid) => {
        let p = parent.get(uid);
        while (p !== uid) {
            parent.set(uid, parent.get(p));
            uid = p;
            p = parent.get(uid);
        }
        return uid;
    };
    const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) {
            parent.set(ra, rb);
        }
    };

    items.forEach((item) => {
        parent.set(item.uid, item.uid);
    });

    const checked = new Set();
    items.forEach((seed) => {
        const scx = Math.floor(seed.x / cell);
        const scy = Math.floor(seed.y / cell);

        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                const bucket = grid.get(cellKey(scx + dx, scy + dy));
                if (!bucket) {
                    continue;
                }
                bucket.forEach((candidate) => {
                    const pair = seed.uid < candidate.uid
                        ? `${seed.uid}|${candidate.uid}`
                        : `${candidate.uid}|${seed.uid}`;
                    if (checked.has(pair)) {
                        return;
                    }
                    checked.add(pair);
                    if (Math.hypot(candidate.x - seed.x, candidate.y - seed.y) <= radius) {
                        union(seed.uid, candidate.uid);
                    }
                });
            }
        }
    });

    const groups = new Map();
    items.forEach((item) => {
        const root = find(item.uid);
        const group = groups.get(root);
        if (group) {
            group.push(item);
        } else {
            groups.set(root, [item]);
        }
    });

    return [...groups.values()];
}

function groupItemsByRadius(items, radius) {
    return groupRawItemsByRadius(items, radius)
        .map((members) => makeClusterNode(members));
}

function itemsFromMarkElements(markElements) {
    return markElements
        .map((mark) => {
            const x = Number.parseFloat(mark.dataset.x || "0");
            const y = Number.parseFloat(mark.dataset.y || "0");
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return null;
            }
            return { uid: mark.dataset.uid, mark, x, y };
        })
        .filter(Boolean);
}

function makeEmptyHierarchy() {
    return [];
}

function clustersForLevelIndex(items, levelIndex) {
    const hierarchy = buildClusterHierarchy(items);
    return hierarchy[levelIndex] || items.map((item) => makeClusterNode([item], "mark"));
}

function structuralClustersForLevelIndex(items, levelIndex) {
    if (levelIndex >= clusterLevels.length) {
        return items.map((item) => makeClusterNode([item], "mark"));
    }

    const hierarchy = buildFullClusterHierarchy(items);
    return hierarchy[levelIndex] || [];
}

function clusterItemsFromMarks(markElements) {
    return markElements.map(markToClusterItem).filter(Boolean);
}

function hasPersistedClusterData() {
    return hasPersistedClusterPayload;
}

function clusterLevelKey(levelIndex) {
    return clusterLevels[levelIndex]?.key || null;
}

function persistedClusterSignature() {
    return [
        persistedClusters
            .map((cluster) => `${cluster.uid}:${cluster.level}:${cluster.parent_uid || ""}:${cluster.anchor_mark_uid}:${cluster.centroid_x}:${cluster.centroid_y}:${cluster.member_count}`)
            .join("|"),
        persistedClusterMemberships
            .map((membership) => `${membership.cluster_uid}:${membership.mark_uid}:${membership.level}`)
            .join("|"),
    ].join("::");
}

function persistedClusterMembers(clusterUid, levelKey, allowedUids = null) {
    const allowed = allowedUids ? new Set(allowedUids) : null;
    const memberUids = persistedClusterMemberships
        .filter((membership) => membership.cluster_uid === clusterUid && membership.level === levelKey)
        .map((membership) => membership.mark_uid);

    return memberUids
        .filter((uid) => allowed === null || allowed.has(uid))
        .map((uid) => marks.find((mark) => mark.dataset.uid === uid))
        .filter(Boolean);
}

function makePersistedClusterNode(cluster, markElements) {
    return {
        id: cluster.uid,
        level: cluster.level,
        x: Number.parseFloat(cluster.centroid_x ?? cluster.anchor_x ?? "0"),
        y: Number.parseFloat(cluster.centroid_y ?? cluster.anchor_y ?? "0"),
        count: markElements.length,
        marks: markElements,
    };
}

function clusterHasVisualCollision(cluster) {
    if (cluster.count <= 1) {
        return false;
    }

    const bounds = boundsForMarks(cluster.marks);
    if (!Number.isFinite(bounds.minX)) {
        return false;
    }

    const width = (bounds.maxX - bounds.minX) * canvasView.zoom;
    const height = (bounds.maxY - bounds.minY) * canvasView.zoom;

    return Math.max(width, height) <= clusterVisualCollisionPx;
}

function persistedClustersForLevel(levelIndex, allowedUids = null, options = {}) {
    const levelKey = clusterLevelKey(levelIndex);
    if (!levelKey) {
        const allowed = allowedUids ? new Set(allowedUids) : null;
        return markClusterItems()
            .filter((item) => allowed === null || allowed.has(item.uid))
            .map((item) => makeClusterNode([item]));
    }

    const nodes = [];
    const coveredUids = new Set();
    persistedClusters
        .filter((cluster) => cluster.level === levelKey)
        .forEach((cluster) => {
            const members = persistedClusterMembers(cluster.uid, levelKey, allowedUids);
            if (members.length === 0) {
                return;
            }
            members.forEach((mark) => coveredUids.add(mark.dataset.uid));

            const node = makePersistedClusterNode(cluster, members);
            if (options.structural || node.count >= 2 && clusterHasVisualCollision(node)) {
                nodes.push(node);
                return;
            }

            nodes.push(...persistedClustersForLevel(levelIndex + 1, members.map((mark) => mark.dataset.uid), options));
        });

    const allowed = allowedUids ? new Set(allowedUids) : null;
    markClusterItems()
        .filter((item) => allowed === null || allowed.has(item.uid))
        .filter((item) => !coveredUids.has(item.uid))
        .forEach((item) => nodes.push(makeClusterNode([item])));

    return nodes;
}

function explodedClusterChildren(cluster, currentLevelIndex) {
    const items = clusterItemsFromMarks(cluster.marks);
    const nextLevelIndex = currentLevelIndex + 1;

    if (nextLevelIndex >= clusterLevels.length) {
        return {
            levelIndex: clusterLevels.length,
            children: structuralClustersForLevelIndex(items, clusterLevels.length),
        };
    }

    const children = structuralClustersForLevelIndex(items, nextLevelIndex);
    if (children.length > 0) {
        return { levelIndex: nextLevelIndex, children };
    }

    return explodedClusterChildren(cluster, nextLevelIndex);
}

function boundsForClusterChildren(children) {
    return children.reduce((bounds, child) => ({
        minX: Math.min(bounds.minX, child.x),
        maxX: Math.max(bounds.maxX, child.x),
        minY: Math.min(bounds.minY, child.y),
        maxY: Math.max(bounds.maxY, child.y),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function mapClusterShape(cluster) {
    if (cluster.marks.length !== 1) {
        return "circle";
    }

    const mark = cluster.marks[0];
    return mark.classList.contains("diamond")
        ? "diamond"
        : mark.classList.contains("square")
            ? "square"
            : "circle";
}

function averageMarkColor(markElements) {
    const channels = markElements
        .map((mark) => /^#([0-9a-f]{6})$/i.exec(mark.style.getPropertyValue("--mark-color").trim()))
        .filter(Boolean)
        .map((match) => Number.parseInt(match[1], 16));

    if (channels.length === 0) {
        return "#3a3550";
    }

    const channel = (shift) => Math.round(
        channels.reduce((total, value) => total + ((value >> shift) & 255), 0) / channels.length,
    ).toString(16).padStart(2, "0");

    return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function mapClusterColor(cluster) {
    if (cluster.marks.length === 1) {
        return cluster.marks[0].style.getPropertyValue("--mark-color") || "#d9826b";
    }

    return averageMarkColor(cluster.marks);
}

function averagePreviousChildClusterCenter(cluster, previousCenters = previousMarkClusterCenter) {
    const seen = new Set();
    const centers = [];
    cluster.marks.forEach((mark) => {
        const center = previousCenters.get(mark.dataset.uid);
        if (!center) {
            return;
        }
        const key = `${center.x}:${center.y}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        centers.push(center);
    });

    if (centers.length === 0) {
        return null;
    }

    return {
        x: centers.reduce((total, center) => total + center.x, 0) / centers.length,
        y: centers.reduce((total, center) => total + center.y, 0) / centers.length,
    };
}

function structuralParentCenterForCluster(cluster, parentLevelIndex) {
    if (parentLevelIndex < 0 || parentLevelIndex >= clusterLevels.length) {
        return null;
    }

    const childUids = new Set(cluster.marks.map((mark) => mark.dataset.uid));
    const parent = structuralClustersForLevelIndex(markClusterItems(), parentLevelIndex)
        .find((candidate) => cluster.marks.every((mark) => (
            candidate.level === clusterLevels[parentLevelIndex].key
            &&
            candidate.marks.some((candidateMark) => candidateMark.dataset.uid === mark.dataset.uid)
        )));

    if (!parent || !clusterContainsAnyUid(parent, childUids)) {
        return null;
    }

    return { x: parent.x, y: parent.y };
}

function clusterContainsAnyUid(cluster, uidSet) {
    if (!uidSet) {
        return true;
    }

    return cluster.marks.some((mark) => uidSet.has(mark.dataset.uid));
}

function setClusterTransitionMode(mode, duration = 560) {
    if (!canvas) {
        return;
    }

    if (mode) {
        canvas.dataset.clusterTransition = mode;
        window.setTimeout(() => {
            if (canvas.dataset.clusterTransition === mode) {
                delete canvas.dataset.clusterTransition;
            }
        }, duration);
        return;
    }

    delete canvas.dataset.clusterTransition;
}

function clearClusterTransitionMode(mode = null) {
    if (!canvas) {
        return;
    }
    if (mode === null || canvas.dataset.clusterTransition === mode) {
        delete canvas.dataset.clusterTransition;
    }
}

function clusterExpansionDuration(levelIndex) {
    return 760 + (Math.max(0, levelIndex) * 70);
}

function startClusterExpansionState(cluster, levelIndex, duration = clusterExpansionDuration(levelIndex)) {
    activeClusterExpansion = {
        x: cluster.x,
        y: cluster.y,
        strength: Math.max(0, levelIndex),
        until: performance.now() + duration,
        uids: new Set(cluster.marks.map((mark) => mark.dataset.uid)),
    };
}

function startClusterExpansion(cluster, expandsToMarks) {
    const currentLevelIdx = clusterLevelIndex();
    const levelWeight = Math.max(0, currentLevelIdx);
    const duration = clusterExpansionDuration(currentLevelIdx);
    startClusterExpansionState(cluster, currentLevelIdx, duration);

    cluster.marks.forEach((mark) => {
        const x = Number.parseFloat(mark.dataset.x || "0");
        const y = Number.parseFloat(mark.dataset.y || "0");
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        mark.style.setProperty("--mark-expand-x", `${cluster.x - x}px`);
        mark.style.setProperty("--mark-expand-y", `${cluster.y - y}px`);
        mark.style.setProperty("--mark-expand-scale", expandsToMarks ? "0.08" : "0.42");
        if (expandsToMarks) {
            mark.dataset.expanding = "true";
        }
    });

    window.setTimeout(() => {
        if (activeClusterExpansion && activeClusterExpansion.until <= performance.now()) {
            activeClusterExpansion = null;
        }
        cluster.marks.forEach((mark) => {
            delete mark.dataset.expanding;
            mark.style.removeProperty("--mark-expand-x");
            mark.style.removeProperty("--mark-expand-y");
            mark.style.removeProperty("--mark-expand-scale");
        });
    }, duration);
}

function clusterLevelIndexForKey(key) {
    return clusterLevels.findIndex((level) => level.key === key);
}

function clusterTargetZoomForLevel(levelIndex, fallbackZoom = canvasView.zoom) {
    const level = clusterLevels[levelIndex];
    if (level) {
        return clampZoom(Math.max(fitWorldZoom(), level.maxZoom - clusterClickZoomMargin));
    }

    return clampZoom(Math.max(1, fallbackZoom));
}

function zoomIntoCluster(cluster, options = {}) {
    if (!canvas || !cluster) {
        return Promise.resolve(null);
    }

    const currentLevelIndex = clusterLevelIndexForKey(cluster.level);
    const effectiveCurrentLevelIndex = currentLevelIndex === -1 ? clusterLevelIndex() : currentLevelIndex;
    const currentLevel = clusterLevels[effectiveCurrentLevelIndex] || activeClusterLevel();
    const explosion = explodedClusterChildren(cluster, currentLevelIndex);
    const nextLevel = clusterLevels[explosion.levelIndex] || null;
    const targetBounds = boundsForClusterChildren(explosion.children);
    if (!Number.isFinite(targetBounds.minX)) {
        return;
    }

    const showsIndividualMarks = explosion.levelIndex >= clusterLevels.length;
    const timing = options.timing || manualClusterOpenTiming;
    const cameraDuration = timing.camera ?? manualClusterOpenTiming.camera;
    const settleDuration = timing.settle ?? manualClusterOpenTiming.settle;
    const animationDuration = Math.max(clusterExpansionDuration(currentLevelIndex), cameraDuration + settleDuration);
    startClusterExpansionState(cluster, currentLevelIndex, animationDuration);

    const opensNeighborToMarks = cluster.level === "neighbor" || explosion.levelIndex >= clusterLevels.length;
    const targetZoom = opensNeighborToMarks
        ? clampZoom(1.2)
        : clusterTargetZoomForLevel(explosion.levelIndex, canvasView.zoom);
    const view = canvasViewForBounds(targetBounds, {
        padding: Math.max(nextLevel?.padding ?? currentLevel?.padding ?? 84, 128),
        minSpan: 1,
        minZoom: 0,
        maxZoom: targetZoom,
    });
    leaveFitWorldMode();

    return new Promise((resolve) => {
        animateCanvasViewTo(view, cameraDuration, {
            easing: easeInOutCubic,
            onComplete: () => {
                if (showsIndividualMarks) {
                    cluster.marks.forEach((mark) => {
                        const x = Number.parseFloat(mark.dataset.x || "0");
                        const y = Number.parseFloat(mark.dataset.y || "0");
                        mark.style.setProperty("--mark-expand-x", `${cluster.x - x}px`);
                        mark.style.setProperty("--mark-expand-y", `${cluster.y - y}px`);
                        mark.style.setProperty("--mark-expand-scale", "0.08");
                        mark.dataset.expanding = "true";
                    });
                    window.setTimeout(() => {
                        cluster.marks.forEach((mark) => {
                            delete mark.dataset.expanding;
                            mark.style.removeProperty("--mark-expand-x");
                            mark.style.removeProperty("--mark-expand-y");
                            mark.style.removeProperty("--mark-expand-scale");
                        });
                        activeClusterExpansion = null;
                        clearClusterTransitionMode("explode");
                        resolve({ cluster, explosion, view });
                    }, settleDuration);
                } else {
                    window.setTimeout(() => {
                        activeClusterExpansion = null;
                        clearClusterTransitionMode("explode");
                        resolve({ cluster, explosion, view });
                    }, settleDuration);
                }
            },
        });
    });
}

function renderMapClusters() {
    if (!mapClusters) {
        return;
    }

    const clusters = currentClusters();
    const level = activeClusterLevel();
    const bubbles = clusters.filter((cluster) => cluster.count > 1);
    const previousClusterCenters = previousMarkClusterCenter;

    const coveredUids = new Set();
    const markClusterCenter = new Map();
    bubbles.forEach((cluster) => {
        cluster.marks.forEach((mark) => {
            coveredUids.add(mark.dataset.uid);
            markClusterCenter.set(mark.dataset.uid, { x: cluster.x, y: cluster.y });
        });
    });
    const transition = pendingClusterTransition;
    const zoomingOut = transition?.direction === "out";
    const zoomingIn = transition?.direction === "in";

    marks.forEach((mark) => {
        const shouldCluster = coveredUids.has(mark.dataset.uid);
        const wasClustered = mark.classList.contains("is-clustered");

        mark.classList.toggle("is-clustered", shouldCluster);

        if (shouldCluster && (!wasClustered || zoomingOut)) {
            const center = markClusterCenter.get(mark.dataset.uid);
            if (center) {
                const mx = Number.parseFloat(mark.dataset.x || "0");
                const my = Number.parseFloat(mark.dataset.y || "0");
                mark.style.setProperty("--coalesce-x", `${center.x - mx}px`);
                mark.style.setProperty("--coalesce-y", `${center.y - my}px`);
            }
            mark.dataset.coalescing = "true";
            window.setTimeout(() => {
                delete mark.dataset.coalescing;
                mark.style.removeProperty("--coalesce-x");
                mark.style.removeProperty("--coalesce-y");
            }, 400);
        }

        if (!shouldCluster && (wasClustered || zoomingIn)) {
            const oldCenter = previousMarkClusterCenter.get(mark.dataset.uid);
            if (oldCenter) {
                const mx = Number.parseFloat(mark.dataset.x || "0");
                const my = Number.parseFloat(mark.dataset.y || "0");
                mark.style.setProperty("--mark-expand-x", `${oldCenter.x - mx}px`);
                mark.style.setProperty("--mark-expand-y", `${oldCenter.y - my}px`);
                mark.style.setProperty("--mark-expand-scale", "0.08");
            }
            mark.dataset.expanding = "true";
            window.setTimeout(() => {
                delete mark.dataset.expanding;
                mark.style.removeProperty("--mark-expand-x");
                mark.style.removeProperty("--mark-expand-y");
                mark.style.removeProperty("--mark-expand-scale");
            }, 540);
        }
    });

    previousMarkClusterCenter = markClusterCenter;

    const signature = `${clusterCacheSignature}:${worldBounds.minX}:${worldBounds.minY}`;
    if (signature === renderedClusterSignature) {
        pendingClusterTransition = null;
        return;
    }
    renderedClusterSignature = signature;

    const hasActiveExpansion = activeClusterExpansion && activeClusterExpansion.until > performance.now();
    const transitionMode = zoomingOut
        ? "coalesce"
        : zoomingIn || hasActiveExpansion
            ? "explode"
            : null;

    mapClusters.innerHTML = "";
    if (transitionMode) {
        clearClusterTransitionMode();
        setClusterTransitionMode(transitionMode, 560);
    } else {
        clearClusterTransitionMode();
    }

    bubbles.forEach((cluster) => {
        const count = cluster.count;
        const shape = mapClusterShape(cluster);
        const size = Math.min(46, 18 + (Math.sqrt(count) * 7));
        const buttonLevelKey = cluster.level || level?.key || "marks";
        const buttonLevel = clusterLevels.find((item) => item.key === buttonLevelKey) || level;
        const button = document.createElement("button");

        const levelWeight = Math.max(0, clusterLevels.findIndex((item) => item.key === buttonLevelKey));
        const expanding = activeClusterExpansion
            && activeClusterExpansion.until > performance.now()
            && clusterContainsAnyUid(cluster, activeClusterExpansion.uids);
        const transitionFrom = zoomingOut || zoomingIn
            ? averagePreviousChildClusterCenter(cluster, previousClusterCenters) || structuralParentCenterForCluster(cluster, transition?.from)
            : null;
        const expandFrom = expanding
            ? {
                x: activeClusterExpansion.x - cluster.x,
                y: activeClusterExpansion.y - cluster.y,
                strength: activeClusterExpansion.strength,
            }
            : transitionFrom
                ? {
                    x: transitionFrom.x - cluster.x,
                    y: transitionFrom.y - cluster.y,
                    strength: levelWeight,
                }
            : { x: 0, y: 0, strength: 0 };

        const levelClass = buttonLevelKey !== "marks" ? ` level-${buttonLevelKey}` : "";
        button.type = "button";
        button.className = count > 1
            ? `map-cluster ${shape} is-multi${levelClass}`
            : `map-cluster ${shape}`;
        button.style.setProperty("--cluster-x", `${cluster.x - worldBounds.minX}px`);
        button.style.setProperty("--cluster-y", `${cluster.y - worldBounds.minY}px`);
        button.style.setProperty("--cluster-screen-size", `${size}px`);
        button.style.setProperty("--cluster-color", mapClusterColor(cluster));
        button.style.setProperty("--cluster-expand-x", `${expandFrom.x}px`);
        button.style.setProperty("--cluster-expand-y", `${expandFrom.y}px`);
        button.style.setProperty("--cluster-expand-scale", String(Math.max(0.18, 0.55 - (expandFrom.strength * 0.05))));
        button.style.setProperty("--cluster-pulse-scale", String(Math.max(0.28, 0.62 - (levelWeight * 0.07))));
        button.style.setProperty("--cluster-pulse-ring", `${8 + (levelWeight * 5)}px`);
        button.dataset.count = String(count);
        button.dataset.clusterId = cluster.id;
        button.dataset.clusterLevel = buttonLevelKey;
        button.setAttribute("aria-pressed", "false");

        if (count > 1) {
            const levelLabel = buttonLevelKey === "neighbor" ? "N"
                : buttonLevelKey === "system" ? "S"
                : buttonLevelKey === "galaxy" ? "G"
                : buttonLevelKey === "supercluster" ? "SC"
                : "";
            button.textContent = String(count);
            button.dataset.levelLabel = levelLabel;
            button.setAttribute("aria-label", `Zoom in to ${count} marks in this ${buttonLevel?.label || "cluster"}`);
        } else {
            button.setAttribute("aria-label", `View mark by ${cluster.marks[0].dataset.name}`);
        }

        button.addEventListener("click", (event) => {
            event.stopPropagation();
            if (count === 1) {
                focusMark(cluster.marks[0], 1.45);
                return;
            }
            zoomIntoCluster(cluster);
        });

        mapClusters.appendChild(button);
    });

    pendingClusterTransition = null;
}

function applyWorldGeometry() {
    if (!canvas) {
        return;
    }

    canvas.style.setProperty("--canvas-world-width", `${worldBounds.maxX - worldBounds.minX}px`);
    canvas.style.setProperty("--canvas-world-height", `${worldBounds.maxY - worldBounds.minY}px`);
    renderCanvasTiles();
}

function coordinateToWorldPercent(coordinate) {
    return ((coordinate - worldBounds.minX) / (worldBounds.maxX - worldBounds.minX)) * 100;
}

function coordinateYToWorldPercent(coordinate) {
    return ((coordinate - worldBounds.minY) / (worldBounds.maxY - worldBounds.minY)) * 100;
}

function positionMarkElement(mark) {
    const x = Number.parseFloat(mark.dataset.x || "0");
    const y = Number.parseFloat(mark.dataset.y || "0");

    mark.style.setProperty("--mark-x", `${coordinateToWorldPercent(x)}%`);
    mark.style.setProperty("--mark-y", `${coordinateYToWorldPercent(y)}%`);
}

function positionAllMarks() {
    marks.forEach(positionMarkElement);
    positionPlacementMarker();
}

function positionPlacementMarker() {
    if (placementMarker && xField?.value && yField?.value) {
        const rect = canvas.getBoundingClientRect();
        const x = Number.parseFloat(xField.value);
        const y = Number.parseFloat(yField.value);
        const screenX = canvasView.panX + ((x - worldBounds.minX) * canvasView.zoom);
        const screenY = canvasView.panY + ((y - worldBounds.minY) * canvasView.zoom);

        placementMarker.style.setProperty("--placement-x", `${(screenX / rect.width) * 100}%`);
        placementMarker.style.setProperty("--placement-y", `${(screenY / rect.height) * 100}%`);
    }
}

function positionMarkPopout() {
    if (!canvas || !markPopout || markPopout.hidden) {
        return;
    }

    const selectedMark = marks.find((mark) => mark.dataset.selected === "true");
    if (!selectedMark) {
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = Number.parseFloat(selectedMark.dataset.x || "0");
    const y = Number.parseFloat(selectedMark.dataset.y || "0");
    const screenX = canvasView.panX + ((x - worldBounds.minX) * canvasView.zoom);
    const screenY = canvasView.panY + ((y - worldBounds.minY) * canvasView.zoom);
    const clampedX = Math.max(170, Math.min(rect.width - 170, screenX));
    const clampedY = Math.max(132, Math.min(rect.height - 18, screenY));

    markPopout.style.setProperty("--popout-x", `${(clampedX / rect.width) * 100}%`);
    markPopout.style.setProperty("--popout-y", `${(clampedY / rect.height) * 100}%`);
}

function cacheMarkPosition(mark) {
    markPositions.set(mark.dataset.uid, {
        x: Number.parseFloat(mark.dataset.x || "0"),
        y: Number.parseFloat(mark.dataset.y || "0"),
    });
}

function rebuildMarkPositionCache() {
    markPositions.clear();
    marks.forEach(cacheMarkPosition);
}

function bufferedWorldBounds(bounds, tileBuffer) {
    const buffer = tileBuffer * tileSize;

    return {
        minX: Math.max(minCoordinate, bounds.minX - buffer),
        maxX: Math.min(maxCoordinate, bounds.maxX + buffer),
        minY: Math.max(minCoordinate, bounds.minY - buffer),
        maxY: Math.min(maxCoordinate, bounds.maxY + buffer),
    };
}

function markIsInsideBounds(mark, bounds) {
    const x = Number.parseFloat(mark.dataset.x || "0");
    const y = Number.parseFloat(mark.dataset.y || "0");

    return Number.isFinite(x) && Number.isFinite(y)
        && x >= bounds.minX && x <= bounds.maxX
        && y >= bounds.minY && y <= bounds.maxY;
}

function mountMark(mark, fragment = null) {
    if (!canvasWorld || mark.parentElement === canvasWorld) {
        return;
    }

    if (fragment) {
        fragment.appendChild(mark);
    } else {
        canvasWorld.appendChild(mark);
    }
}

function unmountMark(mark) {
    if (mark.parentElement === canvasWorld) {
        mark.remove();
    }
}

function renderMarksForViewport() {
    if (!canvas || !canvasWorld) {
        return;
    }

    const bounds = bufferedWorldBounds(visibleWorldBounds(), markRenderBuffer);
    const selectedMark = marks.find((mark) => mark.dataset.selected === "true");
    const fragment = document.createDocumentFragment();
    const nextRenderedMarkUids = new Set();

    marks.forEach((mark) => {
        const shouldRender = mark === selectedMark || markIsInsideBounds(mark, bounds);

        if (shouldRender) {
            positionMarkElement(mark);
            mountMark(mark, fragment);
            nextRenderedMarkUids.add(mark.dataset.uid);
            return;
        }

        unmountMark(mark);
    });

    if (fragment.childNodes.length > 0) {
        canvasWorld.appendChild(fragment);
    }

    renderedMarkUids.clear();
    nextRenderedMarkUids.forEach((uid) => renderedMarkUids.add(uid));
    if (canvas) {
        canvas.dataset.markCulling = "viewport";
        canvas.dataset.renderedMarkCount = String(renderedMarkUids.size);
        canvas.dataset.totalMarkCount = String(marks.length);
    }
}

function clearRenderedMarkCache() {
    renderedMarkUids.clear();
    if (canvas) {
        delete canvas.dataset.renderedMarkCount;
        delete canvas.dataset.totalMarkCount;
    }
}

function applyCanvasView(options = {}) {
    const shouldClamp = options.clamp !== false;
    if (shouldClamp) {
        clampCanvasView();
    }
    if (!canvas) {
        return;
    }
    if (!options.deferClusterCommit) {
        commitClusterLevelForZoom(canvasView.zoom, { animate: options.animateClusterTransition !== false });
    }

    applyWorldGeometry();
    if (geometryDirty) {
        positionAllMarks();
        geometryDirty = false;
    }
    renderMarksForViewport();
    positionPlacementMarker();
    canvas.style.setProperty("--canvas-pan-x", `${canvasView.panX}px`);
    canvas.style.setProperty("--canvas-pan-y", `${canvasView.panY}px`);
    canvas.style.setProperty("--canvas-zoom", String(canvasView.zoom));
    canvas.classList.toggle("is-map-view", canvasView.zoom < mapModeZoom);
    const renderMode = canvasView.zoom < mapModeZoom
        ? "map"
        : visibleTileKeys().size > maxTileOverviewStopCount
            ? "overview"
            : "detail";
    canvas.dataset.renderMode = renderMode;
    renderFogCanvas(renderMode);
    renderMapClusters();
    positionMarkPopout();
    updateZoomControls();
}

function zoomLimits() {
    return {
        min: fitWorldZoom(),
        max: maxCanvasZoom,
    };
}

function clampZoom(zoom) {
    const { min, max } = zoomLimits();
    return Math.max(min, Math.min(max, Number(zoom.toFixed(3))));
}

function formatZoomPercent(zoom) {
    return `${Math.round(zoom * 100)}%`;
}

function updateZoomControls() {
    const { min, max } = zoomLimits();
    const roundedZoom = Number(canvasView.zoom.toFixed(3));

    if (zoomReadout) {
        zoomReadout.value = formatZoomPercent(canvasView.zoom);
        zoomReadout.textContent = formatZoomPercent(canvasView.zoom);
    }

    if (zoomOutButton) {
        zoomOutButton.disabled = roundedZoom <= Number(min.toFixed(3));
    }

    if (zoomInButton) {
        zoomInButton.disabled = roundedZoom >= Number(max.toFixed(3));
    }
}

function tileViewZoomForCount(tileCount) {
    if (!canvas) {
        return 1;
    }

    const rect = canvas.getBoundingClientRect();
    return Math.min(rect.width, rect.height) / (tileCount * tileSize);
}

function overviewZoomStops() {
    const fitZoom = fitWorldZoom();
    const quarterWorldZoom = fitZoom / 0.25;
    const maxTileOverviewZoom = tileViewZoomForCount(maxTileOverviewStopCount);
    const overviewBoundaryZoom = Math.max(quarterWorldZoom, maxTileOverviewZoom);
    const tileStops = tileViewStopCounts
        .map(tileViewZoomForCount)
        .filter((zoom) => zoom > overviewBoundaryZoom + 0.001);
    const worldStops = worldViewStopFractions
        .filter((fraction) => fraction > 0.25)
        .map((fraction) => fitZoom / fraction);
    const clusterStops = clusterLevels.map((level) => level.maxZoom);

    return [...clusterStops, ...tileStops, overviewBoundaryZoom, ...worldStops]
        .map(clampZoom)
        .filter((zoom) => zoom >= fitZoom && zoom <= maxCanvasZoom)
        .filter((zoom, index, stops) => stops.findIndex((item) => Math.abs(item - zoom) <= zoomStopDuplicateTolerance) === index)
        .sort((a, b) => b - a);
}

function nextZoomOutStop(targetZoom) {
    const clampedTarget = clampZoom(targetZoom);
    const nextStop = overviewZoomStops().find((zoom) => zoom < canvasView.zoom - 0.001);

    if (canvasView.zoom <= 1.001 && nextStop) {
        return nextStop;
    }

    if (nextStop && nextStop > clampedTarget + 0.001) {
        return nextStop;
    }

    return clampedTarget;
}

function nextZoomInStop(targetZoom) {
    const clampedTarget = clampZoom(targetZoom);
    const nextStop = [...overviewZoomStops(), 1]
        .sort((a, b) => a - b)
        .find((zoom) => zoom > canvasView.zoom + 0.001);

    if (canvasView.zoom < 0.999 && nextStop) {
        return nextStop;
    }

    if (nextStop && nextStop < clampedTarget - 0.001) {
        return nextStop;
    }

    return clampedTarget;
}

function setExportVisible(isVisible) {
    if (exportTools) {
        exportTools.hidden = !isVisible;
    }
}

function setUndoMarkAvailable(isAvailable, uid = "") {
    undoMarkAvailable = isAvailable && uid !== "";
    if (!undoButton) {
        return;
    }

    if (uid) {
        undoButton.dataset.lastMarkUid = uid;
    } else {
        delete undoButton.dataset.lastMarkUid;
    }
    undoButton.disabled = !undoMarkAvailable;
}

function leaveFitWorldMode() {
    isFitWorldView = false;
    fitReturnView = null;
    setExportVisible(false);
}

function commitTilesForMarks(markItems) {
    markItems.forEach((mark) => {
        const x = Number.parseFloat(mark.dataset?.x ?? mark.x ?? "0");
        const y = Number.parseFloat(mark.dataset?.y ?? mark.y ?? "0");

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        commitTileBandForCoordinate(x, y);
    });
}

function expandWorldForMarks(extraMark = null) {
    const previousBounds = { ...worldBounds };
    commitTilesForMarks(extraMark ? [...marks, extraMark] : marks);
    updateWorldBounds();
    applyCanvasView();

    return previousBounds.minX !== worldBounds.minX
        || previousBounds.maxX !== worldBounds.maxX
        || previousBounds.minY !== worldBounds.minY
        || previousBounds.maxY !== worldBounds.maxY;
}

function rebuildWorldForCurrentMarks() {
    exploredTiles.clear();
    exploredTiles.add("0,0");
    commitTilesForMarks(marks);
    updateWorldBounds();
    geometryDirty = true;
    clearRenderedTileCache();
    clearRenderedMarkCache();
    resetClusterDrilldown();
    clusterCache = [];
    clusterCacheSignature = "";
    renderedClusterSignature = "";
    applyCanvasView();
}

function easeOutCubic(progress) {
    return 1 - Math.pow(1 - progress, 3);
}

function easeOutExpo(progress) {
    return progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
}

function easeOutElastic(progress) {
    const c4 = (2 * Math.PI) / 3;
    if (progress === 0) return 0;
    if (progress === 1) return 1;
    return Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * c4) + 1;
}

function easeInOutCubic(progress) {
    return progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function cancelCanvasViewAnimation() {
    if (!viewAnimation) {
        return;
    }

    window.cancelAnimationFrame(viewAnimation);
    viewAnimation = null;
}

function renderedCanvasView() {
    if (!canvasWorld) {
        return { ...canvasView };
    }

    const matrix = new DOMMatrixReadOnly(getComputedStyle(canvasWorld).transform);
    return {
        zoom: matrix.a || canvasView.zoom,
        panX: matrix.m41,
        panY: matrix.m42,
    };
}

function animateCanvasViewTo(nextView, duration = 520, options = {}) {
    if (!canvas) {
        return;
    }

    cancelCanvasViewAnimation();

    if (duration <= 0) {
        canvasView = nextView;
        commitClusterLevelForZoom(canvasView.zoom, { animate: options.animateClusterTransition !== false });
        applyCanvasView({ ...options, deferClusterCommit: true });
        if (options.onComplete) {
            options.onComplete();
        }
        return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        canvasView = nextView;
        commitClusterLevelForZoom(canvasView.zoom, { animate: options.animateClusterTransition !== false });
        applyCanvasView({ ...options, deferClusterCommit: true });
        if (options.onComplete) {
            options.onComplete();
        }
        return;
    }

    const easingFn = options.easing || easeOutCubic;
    const startView = { ...canvasView };
    const startedAt = performance.now();

    const step = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = easingFn(progress);

        canvasView = {
            zoom: startView.zoom + ((nextView.zoom - startView.zoom) * eased),
            panX: startView.panX + ((nextView.panX - startView.panX) * eased),
            panY: startView.panY + ((nextView.panY - startView.panY) * eased),
        };
        applyCanvasView({ ...options, deferClusterCommit: true });

        if (progress < 1) {
            viewAnimation = window.requestAnimationFrame(step);
        } else {
            viewAnimation = null;
            canvasView = nextView;
            commitClusterLevelForZoom(canvasView.zoom, { animate: options.animateClusterTransition !== false });
            applyCanvasView({ ...options, deferClusterCommit: true });
            if (options.onComplete) {
                options.onComplete();
            }
        }
    };

    viewAnimation = window.requestAnimationFrame(step);
}

function settleCanvasView() {
    const gridDivision = snapGridDivisionForZoom(canvasView.zoom);
    let nextView;

    if (gridDivision >= 3) {
        nextView = gridSnappedCanvasView(canvasView.zoom, canvasView);
    } else {
        const snapStop = zoomSnapStopForZoom(canvasView.zoom);
        if (snapStop?.type === "tile") {
            nextView = tileSnappedCanvasView(snapStop.zoom);
        } else {
            nextView = clampedCanvasView(canvasView);
        }
    }

    if (nextView.panX === canvasView.panX && nextView.panY === canvasView.panY && nextView.zoom === canvasView.zoom) {
        return;
    }

    const useElastic = gridDivision >= 3;
    animateCanvasViewTo(nextView, useElastic ? 400 : 360, {
        clamp: false,
        easing: useElastic ? easeOutElastic : easeOutCubic
    });
}

function focusCanvasOnCoordinate(x, y, targetZoom = 1.35, options = {}) {
    if (!canvas) {
        return;
    }

    resetClusterDrilldown();
    const rect = canvas.getBoundingClientRect();
    const zoom = clampZoom(Math.max(1, targetZoom));

    animateCanvasViewTo({
        zoom,
        panX: (rect.width / 2) - ((x - worldBounds.minX) * zoom),
        panY: (rect.height / 2) - ((y - worldBounds.minY) * zoom),
    }, options.duration ?? 520);
    leaveFitWorldMode();
}

function canvasViewForBounds(bounds, options = {}) {
    const rect = canvas.getBoundingClientRect();
    const padding = options.padding ?? 96;
    const minSpan = options.minSpan ?? tileSize * 0.45;
    const minZoom = options.minZoom ?? 0;
    const maxZoom = options.maxZoom ?? maxCanvasZoom;
    const width = Math.max(bounds.maxX - bounds.minX, minSpan);
    const height = Math.max(bounds.maxY - bounds.minY, minSpan);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const availableWidth = Math.max(1, rect.width - (padding * 2));
    const availableHeight = Math.max(1, rect.height - (padding * 2));
    const zoom = clampZoom(Math.max(minZoom, Math.min(maxZoom, availableWidth / width, availableHeight / height)));

    return {
        zoom,
        panX: (rect.width / 2) - ((centerX - worldBounds.minX) * zoom),
        panY: (rect.height / 2) - ((centerY - worldBounds.minY) * zoom),
    };
}

function fitWorldZoom() {
    if (!canvas) {
        return 1;
    }

    const rect = canvas.getBoundingClientRect();
    const worldWidth = worldBounds.maxX - worldBounds.minX;
    const worldHeight = worldBounds.maxY - worldBounds.minY;
    const padding = 36;
    const availableWidth = Math.max(1, rect.width - (padding * 2));
    const availableHeight = Math.max(1, rect.height - (padding * 2));

    return Math.min(1, availableWidth / worldWidth, availableHeight / worldHeight);
}

function fitWorldView() {
    if (!canvas) {
        return;
    }

    if (isFitWorldView && fitReturnView) {
        const returnView = fitReturnView;
        leaveFitWorldMode();
        animateCanvasViewTo(returnView, 520);
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const worldWidth = worldBounds.maxX - worldBounds.minX;
    const worldHeight = worldBounds.maxY - worldBounds.minY;
    const zoom = fitWorldZoom();

    fitReturnView = { ...canvasView };
    isFitWorldView = true;
    animateCanvasViewTo({
        zoom,
        panX: (rect.width - (worldWidth * zoom)) / 2,
        panY: (rect.height - (worldHeight * zoom)) / 2,
    }, 520, { clamp: false });
    setExportVisible(true);
}

function zoomCanvasTo(targetZoom, origin = null, options = {}) {
    if (!canvas) {
        return;
    }

    cancelCanvasViewAnimation();
    if (!options.keepClusterDrilldown) {
        resetClusterDrilldown();
    }
    const rect = canvas.getBoundingClientRect();
    const currentView = renderedCanvasView();
    canvasView = currentView;
    const oldZoom = currentView.zoom;
    const nextZoom = clampZoom(targetZoom);
    const centerX = origin ? origin.x : rect.width / 2;
    const centerY = origin ? origin.y : rect.height / 2;
    const worldX = (centerX - currentView.panX) / oldZoom;
    const worldY = (centerY - currentView.panY) / oldZoom;
    let nextView = {
        zoom: nextZoom,
        panX: centerX - (worldX * nextZoom),
        panY: centerY - (worldY * nextZoom),
    };
    const entersMapView = oldZoom >= mapModeZoom && nextZoom < mapModeZoom;
    const reachesWorldFloor = nextZoom <= fitWorldZoom() + 0.001 && nextZoom < oldZoom;
    if (reachesWorldFloor) {
        const worldWidth = worldBounds.maxX - worldBounds.minX;
        const worldHeight = worldBounds.maxY - worldBounds.minY;
        nextView = {
            zoom: nextZoom,
            panX: (rect.width - (worldWidth * nextZoom)) / 2,
            panY: (rect.height - (worldHeight * nextZoom)) / 2,
        };
    }

    const duration = entersMapView || reachesWorldFloor
        ? 280
        : options.duration ?? 180;
    const viewOptions = {
        clamp: options.clamp ?? !origin,
    };

    animateCanvasViewTo(nextView, duration, viewOptions);
    leaveFitWorldMode();
}

function zoomCanvas(delta, origin = null, options = {}) {
    const targetZoom = Number((canvasView.zoom + delta).toFixed(2));
    zoomCanvasTo(delta < 0 ? nextZoomOutStop(targetZoom) : nextZoomInStop(targetZoom), origin, options);
}

function zoomCanvasByButton(direction) {
    zoomCanvas(direction * zoomStep);
}

function resetCanvasView() {
    if (!canvas) {
        return;
    }

    cancelCanvasViewAnimation();
    resetClusterDrilldown();
    canvasView = {
        zoom: 1,
        panX: worldBounds.minX,
        panY: worldBounds.minY,
    };
    applyCanvasView();
    leaveFitWorldMode();
}

function svgEscape(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function markShapeSvg(mark, x, y) {
    const color = mark.style.getPropertyValue("--mark-color") || "#d9826b";
    const shape = mark.classList.contains("square")
        ? "square"
        : mark.classList.contains("diamond")
            ? "diamond"
            : "circle";

    if (shape === "square") {
        return `<rect x="${x - 14}" y="${y - 14}" width="28" height="28" rx="4" fill="${svgEscape(color)}" stroke="#fff8eb" stroke-width="3" />`;
    }

    if (shape === "diamond") {
        return `<rect x="${x - 14}" y="${y - 14}" width="28" height="28" rx="4" transform="rotate(45 ${x} ${y})" fill="${svgEscape(color)}" stroke="#fff8eb" stroke-width="3" />`;
    }

    return `<circle cx="${x}" cy="${y}" r="14" fill="${svgEscape(color)}" stroke="#fff8eb" stroke-width="3" />`;
}

function exportWorldSvg() {
    if (!canvas) {
        return;
    }

    applyWorldGeometry();
    const width = worldBounds.maxX - worldBounds.minX;
    const height = worldBounds.maxY - worldBounds.minY;
    const tiles = Array.from(document.querySelectorAll(".canvas-tile"));
    const tileSvg = tiles.map((tile) => {
        const x = Number.parseFloat(tile.style.getPropertyValue("--tile-left")) || 0;
        const y = Number.parseFloat(tile.style.getPropertyValue("--tile-top")) || 0;
        const unavailable = tile.classList.contains("is-unavailable");
        const shade = unavailable
            ? `<rect x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" fill="#2f2a22" opacity="0.2" />`
            : "";

        return [
            `<rect x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" fill="#fbfaf5" stroke="#52493e" stroke-opacity="0.18" stroke-width="1" />`,
            `<image href="/assets/images/cave-wall-texture.png" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" preserveAspectRatio="none" opacity="0.55" />`,
            `<path d="M ${x} ${y} h ${tileSize} v ${tileSize} h -${tileSize} Z" fill="url(#grid)" />`,
            shade,
        ].join("");
    }).join("");
    const markSvg = marks.map((mark) => {
        const markX = Number.parseFloat(mark.dataset.x || "0") - worldBounds.minX;
        const markY = Number.parseFloat(mark.dataset.y || "0") - worldBounds.minY;
        const label = svgEscape(mark.dataset.name || "Mark");

        return `<g data-uid="${svgEscape(mark.dataset.uid || "")}" aria-label="${label}">${markShapeSvg(mark, markX, markY)}<title>${label}</title></g>`;
    }).join("");
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Exported mark world">
  <defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 H 0 V 32" fill="none" stroke="#403a32" stroke-opacity="0.12" stroke-width="1" />
      <circle cx="16" cy="16" r="1.2" fill="#51463a" opacity="0.18" />
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="#f7f5ef" />
  ${tileSvg}
  ${markSvg}
</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mark-world-${new Date().toISOString().slice(0, 10)}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasPointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: worldBounds.minX + ((event.clientX - rect.left - canvasView.panX) / canvasView.zoom),
        y: worldBounds.minY + ((event.clientY - rect.top - canvasView.panY) / canvasView.zoom),
    };
}

function visibleWorldBounds() {
    const rect = canvas.getBoundingClientRect();
    return {
        minX: Math.max(minCoordinate, worldBounds.minX + ((0 - canvasView.panX) / canvasView.zoom)),
        maxX: Math.min(maxCoordinate, worldBounds.minX + ((rect.width - canvasView.panX) / canvasView.zoom)),
        minY: Math.max(minCoordinate, worldBounds.minY + ((0 - canvasView.panY) / canvasView.zoom)),
        maxY: Math.min(maxCoordinate, worldBounds.minY + ((rect.height - canvasView.panY) / canvasView.zoom)),
    };
}

function clearPlacementState() {
    if (canvas) {
        delete canvas.dataset.placementState;
    }
}

function isTextInputTarget(target) {
    return target?.closest("input, textarea, select, [contenteditable='true']");
}

function updatePanIntent() {
    if (!canvas) {
        return;
    }

    if (keyboardPanActive) {
        canvas.dataset.nav = "pan";
    } else {
        delete canvas.dataset.nav;
    }
}

function isPanGesture(event) {
    return event.button === 0 && (event.shiftKey || keyboardPanActive);
}

function tooCloseToExistingMarks(x, y, ignoredUid = "") {
    const minDistanceSquared = minDistance * minDistance;

    for (const [uid, position] of markPositions.entries()) {
        if (ignoredUid && uid === ignoredUid) {
            continue;
        }

        const dx = x - position.x;
        const dy = y - position.y;
        if ((dx * dx) + (dy * dy) < minDistanceSquared) {
            return true;
        }
    }

    if (markPositions.size > 0) {
        return false;
    }

    return marks.some((mark) => {
        if (ignoredUid && mark.dataset.uid === ignoredUid) {
            return false;
        }

        const markX = Number.parseFloat(mark.dataset.x || "0");
        const markY = Number.parseFloat(mark.dataset.y || "0");
        const dx = x - markX;
        const dy = y - markY;
        return (dx * dx) + (dy * dy) < minDistanceSquared;
    });
}

function placementStateForPoint(x, y) {
    if (x < minCoordinate || x > maxCoordinate || y < minCoordinate || y > maxCoordinate) {
        return "invalid";
    }

    if (!isPlaceableCoordinate(x, y)) {
        return "invalid";
    }

    return tooCloseToExistingMarks(x, y) ? "invalid" : "valid";
}

function updatePlacementHover(event) {
    if (!canvas || event.target.closest(".canvas-hint") || event.target.closest(".mark-dot")) {
        clearPlacementState();
        return;
    }

    const { x, y } = canvasPointFromEvent(event);
    canvas.dataset.placementState = placementStateForPoint(x, y);
}

function rejectPlacement(message) {
    xField.value = "";
    yField.value = "";
    if (placementMarker) {
        placementMarker.hidden = true;
    }
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Choose another spot";
    }
    placementNote.classList.add("error");
    placementNote.textContent = message;
    return false;
}

function setPlacement(x, y) {
    applyWorldGeometry();

    if (x < minCoordinate || x > maxCoordinate || y < minCoordinate || y > maxCoordinate) {
        return rejectPlacement("Choose a spot inside the available canvas.");
    }

    const selectedX = x;
    const selectedY = y;

    if (!isPlaceableCoordinate(selectedX, selectedY)) {
        return rejectPlacement("Choose a spot inside the available canvas.");
    }

    if (tooCloseToExistingMarks(selectedX, selectedY)) {
        return rejectPlacement("Too close to another mark. Click somewhere with more breathing room.");
    }

    xField.value = selectedX.toFixed(2);
    yField.value = selectedY.toFixed(2);
    if (placementMarker) {
        positionPlacementMarker();
        placementMarker.hidden = false;
    }
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Place mark";
    }
    placementNote.classList.remove("error");
    placementNote.textContent = `Selected spot: ${xField.value}px, ${yField.value}px`;
    return true;
}

function hideMarkPopout() {
    if (markPopout) {
        markPopout.hidden = true;
    }
}

function selectMark(mark, options = {}) {
    marks.forEach((item) => item.removeAttribute("data-selected"));
    mountMark(mark);
    positionMarkElement(mark);
    mark.setAttribute("data-selected", "true");
    markPreview?.classList.remove("is-empty");

    previewChip.style.background = getComputedStyle(mark).getPropertyValue("--mark-color");
    previewName.textContent = mark.dataset.name;
    previewMessage.textContent = mark.dataset.message;
    renderDrawingPreview(mark.dataset.drawing || "");
    previewCreated.textContent = mark.dataset.created;
    if (markPopout) {
        markPopout.hidden = options.showPopout === false;
        positionMarkPopout();
    }
}

function setEmptyPreview() {
    marks.forEach((item) => item.removeAttribute("data-selected"));
    markPreview?.classList.add("is-empty");
    hideMarkPopout();
    previewChip.style.background = "#f0b35a";
    previewName.textContent = "No mark selected";
    previewMessage.textContent = "Choose an existing mark to preview it here.";
    if (previewDrawing) {
        previewDrawing.innerHTML = "";
        previewDrawing.hidden = true;
    }
    previewCreated.textContent = "Waiting for the first mark.";
}

function focusMark(mark, targetZoom = 1.35, options = {}) {
    if (!mark) {
        return;
    }

    mountMark(mark);
    selectMark(mark, { showPopout: options.showPopout !== false });
    focusCanvasOnCoordinate(
        Number.parseFloat(mark.dataset.x || "0"),
        Number.parseFloat(mark.dataset.y || "0"),
        targetZoom,
        { duration: options.duration },
    );
}

function markUid(mark) {
    return mark?.dataset?.uid || "";
}

function clusterPathForMark(mark) {
    const uid = markUid(mark);
    if (!uid) {
        return [];
    }

    const hierarchy = buildFullClusterHierarchy(markClusterItems());
    return clusterLevels
        .map((level, levelIndex) => {
            const cluster = (hierarchy[levelIndex] || []).find((item) => (
                item.level === level.key
                && item.count > 1
                && item.marks.some((clusterMark) => markUid(clusterMark) === uid)
            ));
            return cluster ? { level, levelIndex, cluster } : null;
        })
        .filter(Boolean);
}

function worldOverviewView() {
    const rect = canvas.getBoundingClientRect();
    const worldWidth = worldBounds.maxX - worldBounds.minX;
    const worldHeight = worldBounds.maxY - worldBounds.minY;
    const zoom = fitWorldZoom();

    return {
        zoom,
        panX: (rect.width - (worldWidth * zoom)) / 2,
        panY: (rect.height - (worldHeight * zoom)) / 2,
    };
}

function clusterCenterIsInsideViewport(cluster) {
    const bounds = viewportWorldBounds(0);
    if (!bounds) {
        return true;
    }

    return cluster.x >= bounds.minX && cluster.x <= bounds.maxX
        && cluster.y >= bounds.minY && cluster.y <= bounds.maxY;
}

function markIsVisibleAtIndividualZoom(mark) {
    const x = Number.parseFloat(mark.dataset.x || "0");
    const y = Number.parseFloat(mark.dataset.y || "0");
    const bounds = viewportWorldBounds(0);
    if (!bounds || !Number.isFinite(x) || !Number.isFinite(y)) {
        return false;
    }

    return canvasView.zoom > clusterZoomThresholds.neighbor + zoomSnapTolerance
        && x >= bounds.minX && x <= bounds.maxX
        && y >= bounds.minY && y <= bounds.maxY;
}

function recentClusterStartIndex(path) {
    const currentLevelIndex = clusterLevelIndex();
    const visibleIndex = path.findIndex(({ levelIndex, cluster }) => (
        levelIndex >= currentLevelIndex
        && canvasView.zoom <= clusterLevels[levelIndex].maxZoom + zoomSnapTolerance
        && clusterCenterIsInsideViewport(cluster)
    ));

    return visibleIndex === -1 ? 0 : visibleIndex;
}

function focusRecentMarkThroughClusters(mark) {
    if (!mark || !canvas) {
        return;
    }

    mountMark(mark);

    if (markIsVisibleAtIndividualZoom(mark)) {
        focusMark(mark, 1.35);
        return;
    }

    const path = clusterPathForMark(mark);
    if (path.length === 0) {
        focusMark(mark, 1.35);
        return;
    }

    const token = recentFocusToken + 1;
    recentFocusToken = token;
    const startIndex = recentClusterStartIndex(path);

    const animateStep = async (index) => {
        if (recentFocusToken !== token) {
            return;
        }

        if (index >= path.length) {
            focusMark(mark, 1.35, { duration: recentClusterOpenTiming.finalFocus });
            return;
        }

        await zoomIntoCluster(path[index].cluster, { timing: recentClusterOpenTiming });
        animateStep(index + 1);
    };

    leaveFitWorldMode();
    if (startIndex === 0 && path.length > 0) {
        animateCanvasViewTo(worldOverviewView(), recentClusterOpenTiming.world, {
            clamp: false,
            easing: easeInOutCubic,
            onComplete: () => animateStep(0),
        });
        return;
    }

    animateStep(startIndex);
}

function bindMark(mark) {
    mark.addEventListener("click", (event) => {
        event.stopPropagation();
        selectMark(mark);
    });
}

function formatCreatedAt(value) {
    const date = new Date(`${value.replace(" ", "T")}Z`);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function apiMarkToView(mark) {
    return {
        uid: mark.uid,
        name: mark.display_name,
        message: mark.message || (mark.drawing ? "A quiet sketch without words." : "A quiet mark without words."),
        drawing: mark.drawing || "",
        x: Number.parseFloat(mark.x_percent),
        y: Number.parseFloat(mark.y_percent),
        color: mark.color,
        shape: mark.shape,
        created: formatCreatedAt(mark.created_at),
    };
}

function createMarkElement(mark) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mark-dot ${mark.shape}`;
    button.style.setProperty("--mark-color", mark.color);
    button.dataset.uid = mark.uid;
    button.dataset.name = mark.name;
    button.dataset.message = mark.message;
    button.dataset.drawing = mark.drawing;
    button.dataset.created = mark.created;
    button.dataset.x = String(mark.x);
    button.dataset.y = String(mark.y);
    positionMarkElement(button);
    button.setAttribute("aria-label", `View saved ${mark.shape} mark by ${mark.name}`);
    bindMark(button);

    return button;
}

function animateNewMark(mark) {
    mark.dataset.new = "true";
    mark.addEventListener("animationend", () => {
        delete mark.dataset.new;
    }, { once: true });
}

function wait(milliseconds) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, milliseconds);
    });
}

function animateUndoMark(mark) {
    if (!mark || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return Promise.resolve();
    }

    mark.classList.add("is-undoing");

    return new Promise((resolve) => {
        mark.addEventListener("animationend", resolve, { once: true });
        window.setTimeout(resolve, 760);
    });
}

function removeMarkElement(mark) {
    if (!mark) {
        return;
    }

    const wasSelected = mark.dataset.selected === "true";
    marks = marks.filter((item) => item !== mark);
    markPositions.delete(mark.dataset.uid);
    renderedMarkUids.delete(mark.dataset.uid);
    mark.remove();
    rebuildWorldForCurrentMarks();

    if (wasSelected) {
        if (marks.length > 0) {
            selectMark(marks[marks.length - 1], { showPopout: false });
        } else {
            setEmptyPreview();
        }
    }
}

function addOrUpdateMark(mark, select = false, options = {}) {
    const existing = marks.find((item) => item.dataset.uid === mark.uid);
    if (existing) {
        existing.className = `mark-dot ${mark.shape}`;
        existing.dataset.name = mark.name;
        existing.dataset.message = mark.message;
        existing.dataset.drawing = mark.drawing;
        existing.dataset.created = mark.created;
        existing.dataset.x = String(mark.x);
        existing.dataset.y = String(mark.y);
        existing.style.setProperty("--mark-color", mark.color);
        cacheMarkPosition(existing);
        positionMarkElement(existing);
        if (!options.deferLayout) {
            expandWorldForMarks();
        }
        if (select) {
            selectMark(existing);
        }
        return existing;
    }

    const element = createMarkElement(mark);
    marks.push(element);
    cacheMarkPosition(element);
    const tileX = Math.floor(Number.parseFloat(mark.x ?? "0") / tileSize);
    const tileY = Math.floor(Number.parseFloat(mark.y ?? "0") / tileSize);
    revealExploredNeighbors(tileX, tileY);
    if (!options.deferLayout) {
        expandWorldForMarks();
    }
    if (select) {
        animateNewMark(element);
    }
    if (select) {
        mountMark(element);
        selectMark(element);
    } else {
        renderMarksForViewport();
    }
    return element;
}

function updateShapePreviewColor() {
    if (!form) {
        return;
    }

    const selectedColor = colorInputs.find((input) => input.checked)?.value || "#d9826b";
    const selectedShape = shapeInputs.find((input) => input.checked)?.value || "circle";
    form.style.setProperty("--selected-mark-color", selectedColor);
    placementMarker?.style.setProperty("--selected-mark-color", selectedColor);
    if (placementMarker) {
        placementMarker.classList.toggle("circle", selectedShape === "circle");
        placementMarker.classList.toggle("square", selectedShape === "square");
        placementMarker.classList.toggle("diamond", selectedShape === "diamond");
    }
}

function updateCharacterCounts() {
    countedInputs.forEach((input) => {
        const output = document.querySelector(`[data-count-for="${input.dataset.countInput}"]`);
        if (output) {
            output.textContent = String(input.value.length);
        }
    });
}

function drawingToPaths(drawing) {
    if (!drawing) {
        return [];
    }

    try {
        const payload = JSON.parse(drawing);
        if (!payload || !Array.isArray(payload.strokes)) {
            return [];
        }

        return payload.strokes
            .filter((stroke) => Array.isArray(stroke) && stroke.length > 0)
            .map((stroke) => stroke.map((point) => {
                if (Array.isArray(point)) {
                    return {
                        x: Number(point[0]),
                        y: Number(point[1]),
                    };
                }

                return {
                    x: Number(point.x),
                    y: Number(point.y),
                };
            }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
    } catch (_error) {
        return [];
    }
}

function renderDrawingPreview(drawing) {
    if (!previewDrawing) {
        return;
    }

    const paths = drawingToPaths(drawing);
    previewDrawing.innerHTML = "";
    previewDrawing.hidden = paths.length === 0;

    if (paths.length === 0) {
        return;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");

    paths.forEach((stroke) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const commands = stroke.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`);
        if (stroke.length === 1) {
            commands.push(`L ${stroke[0].x + 0.01} ${stroke[0].y + 0.01}`);
        }
        path.setAttribute("d", commands.join(" "));
        svg.appendChild(path);
    });

    previewDrawing.appendChild(svg);
}

function removeMissingMarks(markUids, options = {}) {
    if (!Array.isArray(markUids)) {
        return;
    }

    const uidSet = new Set(markUids);
    const originalCount = marks.length;
    marks = marks.filter((mark) => {
        if (uidSet.has(mark.dataset.uid)) {
            return true;
        }

        mark.remove();
        markPositions.delete(mark.dataset.uid);
        renderedMarkUids.delete(mark.dataset.uid);
        return false;
    });

    if (marks.length !== originalCount && !options.deferLayout) {
        rebuildWorldForCurrentMarks();
    }
}

function updateCounts(count) {
    if (canvas) {
        canvas.classList.toggle("has-marks", count > 0);
    }
    if (entryCount) {
        entryCount.textContent = count;
    }
    if (entryCountLabel) {
        entryCountLabel.textContent = "marks on the wall";
    }
    if (recentTotal) {
        recentTotal.textContent = count;
    }
    if (focusLatestButton) {
        focusLatestButton.disabled = count === 0;
    }
}

function renderRecent(markItems) {
    if (!recentList) {
        return;
    }

    recentList.innerHTML = "";
    if (markItems.length === 0) {
        const item = document.createElement("li");
        item.className = "recent-empty";
        item.textContent = "No recent marks yet.";
        recentList.appendChild(item);
        return;
    }

    markItems.forEach((mark) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        const dot = document.createElement("span");
        const body = document.createElement("span");
        const name = document.createElement("strong");
        const message = document.createElement("p");
        const created = document.createElement("small");

        button.type = "button";
        button.className = "recent-mark-button";
        button.dataset.recentUid = mark.uid;
        dot.className = `recent-dot ${mark.shape}`;
        dot.style.setProperty("--mark-color", mark.color);
        name.textContent = mark.name;
        message.textContent = mark.message;
        created.textContent = mark.created;

        body.append(name, message, created);
        button.append(dot, body);
        item.append(button);
        recentList.appendChild(item);
    });
}

function showMarkToast(mark) {
    if (!toastRegion) {
        return;
    }

    const toast = document.createElement("div");
    const dot = document.createElement("span");
    const body = document.createElement("div");
    const title = document.createElement("strong");
    const message = document.createElement("span");

    toast.className = "mark-toast";
    dot.className = `recent-dot ${mark.shape}`;
    dot.style.setProperty("--mark-color", mark.color);
    title.textContent = `${mark.name} left a mark`;
    message.textContent = mark.message;

    body.append(title, message);
    toast.append(dot, body);
    toastRegion.prepend(toast);

    window.setTimeout(() => {
        toast.classList.add("hide");
        toast.addEventListener("animationend", () => toast.remove(), { once: true });
    }, 4200);
}

function updateDrawingField() {
    if (!drawingField) {
        return;
    }

    const cleanStrokes = drawingStrokes
        .map((stroke) => stroke.map((point) => [
            Number(point.x.toFixed(1)),
            Number(point.y.toFixed(1)),
        ]))
        .filter((stroke) => stroke.length > 0);

    drawingField.value = cleanStrokes.length > 0
        ? JSON.stringify({ v: 1, strokes: cleanStrokes })
        : "";
    updateDrawingControls();
}

function updateDrawingControls() {
    if (drawingUndo) {
        drawingUndo.disabled = drawingStrokes.length === 0;
    }
    if (drawingClear) {
        drawingClear.disabled = drawingStrokes.length === 0;
    }
}

function renderDrawingCanvas() {
    if (!drawingCanvas) {
        return;
    }

    const context = drawingCanvas.getContext("2d");
    context.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 4;
    context.strokeStyle = "#4b4035";

    drawingStrokes.forEach((stroke) => {
        if (stroke.length === 0) {
            return;
        }

        context.beginPath();
        stroke.forEach((point, index) => {
            const x = (point.x / 100) * drawingCanvas.width;
            const y = (point.y / 100) * drawingCanvas.height;
            if (index === 0) {
                context.moveTo(x, y);
            } else {
                context.lineTo(x, y);
            }
        });
        context.stroke();
    });
}

function drawingPointFromEvent(event) {
    const rect = drawingCanvas.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    };
}

function updateEraserIndicator(event) {
    if (!drawingCanvas || !drawingEraserIndicator) {
        return;
    }

    const rect = drawingCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const size = (eraserRadius / 100) * rect.width * 2;

    drawingEraserIndicator.style.setProperty("--eraser-x", `${x}px`);
    drawingEraserIndicator.style.setProperty("--eraser-y", `${y}px`);
    drawingEraserIndicator.style.setProperty("--eraser-size", `${size}px`);
    drawingEraserIndicator.hidden = drawingMode !== "erase";
}

function setDrawingMode(nextMode) {
    drawingMode = nextMode;
    activeStroke = null;
    drawingPen?.classList.toggle("active", drawingMode === "draw");
    drawingEraser?.classList.toggle("active", drawingMode === "erase");
    if (drawingCanvas) {
        drawingCanvas.dataset.mode = drawingMode;
    }
    if (drawingEraserIndicator) {
        drawingEraserIndicator.hidden = drawingMode !== "erase";
    }
}

function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (dx === 0 && dy === 0) {
        return Math.hypot(point.x - start.x, point.y - start.y);
    }

    const progress = Math.max(0, Math.min(1, (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / ((dx * dx) + (dy * dy))));
    const x = start.x + (dx * progress);
    const y = start.y + (dy * progress);

    return Math.hypot(point.x - x, point.y - y);
}

function pointAtSegmentProgress(start, end, progress) {
    return {
        x: start.x + ((end.x - start.x) * progress),
        y: start.y + ((end.y - start.y) * progress),
    };
}

function outsideCircleIntervals(start, end, center, radius) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fx = start.x - center.x;
    const fy = start.y - center.y;
    const a = (dx * dx) + (dy * dy);

    if (a === 0) {
        return Math.hypot(fx, fy) <= radius ? [] : [[0, 1]];
    }

    const b = 2 * ((fx * dx) + (fy * dy));
    const c = (fx * fx) + (fy * fy) - (radius * radius);
    const discriminant = (b * b) - (4 * a * c);

    if (discriminant <= 0) {
        return distanceToSegment(center, start, end) <= radius ? [] : [[0, 1]];
    }

    const root = Math.sqrt(discriminant);
    const enter = Math.max(0, Math.min(1, (-b - root) / (2 * a)));
    const exit = Math.max(0, Math.min(1, (-b + root) / (2 * a)));

    if (exit <= 0 || enter >= 1) {
        return [[0, 1]];
    }

    return [
        [0, enter],
        [exit, 1],
    ].filter(([startProgress, endProgress]) => endProgress - startProgress > 0.001);
}

function pushPointIfDifferent(stroke, point) {
    const lastPoint = stroke[stroke.length - 1];
    if (lastPoint && Math.abs(lastPoint.x - point.x) < 0.001 && Math.abs(lastPoint.y - point.y) < 0.001) {
        return;
    }

    stroke.push(point);
}

function eraseStrokeAtPoint(stroke, point, radius = eraserRadius) {
    if (stroke.length === 1) {
        return Math.hypot(stroke[0].x - point.x, stroke[0].y - point.y) <= radius
            ? { pieces: [], changed: true }
            : { pieces: [stroke], changed: false };
    }

    const pieces = [];
    let currentPiece = [];
    let changed = false;

    for (let index = 1; index < stroke.length; index += 1) {
        const start = stroke[index - 1];
        const end = stroke[index];
        const intervals = outsideCircleIntervals(start, end, point, radius);
        changed = changed || intervals.length !== 1 || intervals[0][0] !== 0 || intervals[0][1] !== 1;

        intervals.forEach(([startProgress, endProgress]) => {
            if (startProgress > 0 && currentPiece.length > 0) {
                pieces.push(currentPiece);
                currentPiece = [];
            }

            pushPointIfDifferent(currentPiece, pointAtSegmentProgress(start, end, startProgress));
            pushPointIfDifferent(currentPiece, pointAtSegmentProgress(start, end, endProgress));

            if (endProgress < 1 && currentPiece.length > 0) {
                pieces.push(currentPiece);
                currentPiece = [];
            }
        });

        if (intervals.length === 0 && currentPiece.length > 0) {
            pieces.push(currentPiece);
            currentPiece = [];
        }
    }

    if (currentPiece.length > 0) {
        pieces.push(currentPiece);
    }

    return { pieces: pieces.filter((piece) => piece.length > 0), changed };
}

function eraseDrawingAtPoint(point) {
    let changed = false;
    const nextStrokes = drawingStrokes.flatMap((stroke) => {
        const result = eraseStrokeAtPoint(stroke, point);
        changed = changed || result.changed;
        return result.pieces;
    });

    if (changed) {
        drawingStrokes = nextStrokes;
        updateDrawingField();
        renderDrawingCanvas();
    }
}

function undoDrawingStroke() {
    drawingStrokes.pop();
    activeStroke = null;
    updateDrawingField();
    renderDrawingCanvas();
}

function clearDrawing() {
    drawingStrokes = [];
    activeStroke = null;
    updateDrawingField();
    renderDrawingCanvas();
}

function syncMarks(payload) {
    const markItems = payload.marks.map(apiMarkToView);
    const recentMarks = (payload.recent_marks || payload.marks).map(apiMarkToView);
    const existingUids = new Set(marks.map((mark) => mark.dataset.uid));
    hasPersistedClusterPayload = Array.isArray(payload.clusters) && Array.isArray(payload.cluster_memberships);
    persistedClusters = hasPersistedClusterPayload ? payload.clusters : [];
    persistedClusterMemberships = hasPersistedClusterPayload ? payload.cluster_memberships : [];
    clusterCacheSignature = "";
    renderedClusterSignature = "";
    markItems.forEach((mark) => addOrUpdateMark(mark, false, { deferLayout: true }));
    removeMissingMarks(payload.mark_uids, { deferLayout: true });
    rebuildMarkPositionCache();
    rebuildWorldForCurrentMarks();
    renderRecent(recentMarks);
    updateCounts(payload.count);
    if (marks.length === 0) {
        setEmptyPreview();
    }

    if (liveSyncReady) {
        recentMarks
            .filter((mark) => !existingUids.has(mark.uid))
            .reverse()
            .forEach(showMarkToast);
    }

    liveSyncReady = true;
}

window.addEventListener("test:syncMarks", (event) => {
    syncMarks(event.detail);
});

window.addEventListener("test:setCanvasView", (event) => {
    if (!event.detail) {
        return;
    }

    canvasView = {
        zoom: Number(event.detail.zoom ?? canvasView.zoom),
        panX: Number(event.detail.panX ?? canvasView.panX),
        panY: Number(event.detail.panY ?? canvasView.panY),
    };
    applyCanvasView({ clamp: event.detail.clamp !== false });
});

async function refreshRecentMarks() {
    const response = await fetch("/api/marks.php", { headers: { Accept: "application/json" } });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
        return;
    }

    syncMarks(payload);
}

function startPollingFallback() {
    refreshRecentMarks();
    window.setInterval(refreshRecentMarks, 5000);
}

function startLiveUpdates() {
    if (!("EventSource" in window)) {
        startPollingFallback();
        return;
    }

    const events = new EventSource("/api/marks-stream.php");
    let fallbackStarted = false;

    events.addEventListener("marks.sync", (event) => {
        const payload = JSON.parse(event.data);
        if (payload.ok) {
            syncMarks(payload);
        }
    });

    events.addEventListener("error", () => {
        if (fallbackStarted) {
            return;
        }

        fallbackStarted = true;
        events.close();
        startPollingFallback();
    });
}

marks.forEach(bindMark);
rebuildMarkPositionCache();
const selectedMark = marks.find((mark) => mark.dataset.selected === "true");
if (selectedMark) {
    selectMark(selectedMark, { showPopout: false });
} else if (marks.length === 0) {
    setEmptyPreview();
}

updateShapePreviewColor();
updateCharacterCounts();
colorInputs.forEach((input) => {
    input.addEventListener("change", updateShapePreviewColor);
});
shapeInputs.forEach((input) => {
    input.addEventListener("change", updateShapePreviewColor);
});
countedInputs.forEach((input) => {
    input.addEventListener("input", updateCharacterCounts);
});
expandWorldForMarks();

if (drawingCanvas) {
    drawingCanvas.addEventListener("pointerdown", (event) => {
        if (drawingMode === "erase") {
            drawingCanvas.setPointerCapture(event.pointerId);
            updateEraserIndicator(event);
            eraseDrawingAtPoint(drawingPointFromEvent(event));
            return;
        }

        drawingCanvas.setPointerCapture(event.pointerId);
        activeStroke = [drawingPointFromEvent(event)];
        drawingStrokes.push(activeStroke);
        updateDrawingControls();
        renderDrawingCanvas();
    });

    drawingCanvas.addEventListener("pointermove", (event) => {
        if (drawingMode === "erase") {
            updateEraserIndicator(event);
        }

        if (drawingMode === "erase" && event.buttons === 1) {
            eraseDrawingAtPoint(drawingPointFromEvent(event));
            return;
        }

        if (!activeStroke) {
            return;
        }

        activeStroke.push(drawingPointFromEvent(event));
        renderDrawingCanvas();
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
        drawingCanvas.addEventListener(eventName, () => {
            activeStroke = null;
            updateDrawingField();
            if (eventName === "pointerleave" && drawingEraserIndicator) {
                drawingEraserIndicator.hidden = true;
            }
        });
    });

    drawingCanvas.addEventListener("pointerenter", (event) => {
        if (drawingMode === "erase") {
            updateEraserIndicator(event);
        }
    });
}

if (drawingPen) {
    drawingPen.addEventListener("click", () => setDrawingMode("draw"));
}

if (drawingEraser) {
    drawingEraser.addEventListener("click", () => setDrawingMode("erase"));
}

if (drawingUndo) {
    drawingUndo.addEventListener("click", undoDrawingStroke);
}

if (drawingClear) {
    drawingClear.addEventListener("click", clearDrawing);
}

updateDrawingField();
setDrawingMode("draw");
setUndoMarkAvailable(undoMarkAvailable, undoButton?.dataset.lastMarkUid || "");

if (hideCanvasHint && canvasHint) {
    hideCanvasHint.addEventListener("click", () => {
        canvasHint.hidden = true;
    });
}

if (canvasHint) {
    canvasHintTimer = window.setTimeout(() => {
        canvasHint.hidden = true;
    }, 7000);
    canvasHint.addEventListener("pointerenter", () => {
        if (canvasHintTimer) {
            window.clearTimeout(canvasHintTimer);
            canvasHintTimer = null;
        }
    });
    canvasHint.addEventListener("pointerleave", () => {
        canvasHintTimer = window.setTimeout(() => {
            canvasHint.hidden = true;
        }, 2400);
    });
}

if (canvas && xField && yField && placementNote) {
    if (placeButton) {
        placeButton.addEventListener("click", () => {
            setActiveTool(placeButton);
            placementNote.classList.remove("error");
            placementNote.textContent = "Click an open spot on the wall.";
        });
    }

    if (zoomInButton) {
        zoomInButton.addEventListener("click", () => zoomCanvasByButton(1));
    }

    if (zoomOutButton) {
        zoomOutButton.addEventListener("click", () => zoomCanvasByButton(-1));
    }

    if (resetViewButton) {
        resetViewButton.addEventListener("click", resetCanvasView);
    }

    if (fitWorldButton) {
        fitWorldButton.addEventListener("click", fitWorldView);
    }

    if (exportWorldButton) {
        exportWorldButton.addEventListener("click", exportWorldSvg);
    }

    canvas.addEventListener("pointerdown", (event) => {
        if (!isPanGesture(event) || event.target.closest(".canvas-hint") || event.target.closest(".mark-dot")) {
            return;
        }

        event.preventDefault();
        cancelCanvasViewAnimation();
        cancelPanMomentum();
        resetPanMomentum();
        panStart = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            panX: canvasView.panX,
            panY: canvasView.panY,
        };
        suppressNextCanvasClick = true;
        canvas.classList.add("is-panning");
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
        if (!panStart || panStart.pointerId !== event.pointerId) {
            if (!panStart) {
                updatePlacementHover(event);
            }
            return;
        }

        const deltaX = event.clientX - panStart.clientX;
        const deltaY = event.clientY - panStart.clientY;

        if (Math.hypot(deltaX, deltaY) > 3) {
            suppressNextCanvasClick = true;
            suppressNextDocumentClick = true;
        }

        updatePanMomentum(event.clientX, event.clientY);
        const { minPanX, maxPanX, minPanY, maxPanY } = canvasPanBounds();
        canvasView.panX = rubberbandPan(panStart.panX + deltaX, minPanX, maxPanX);
        canvasView.panY = rubberbandPan(panStart.panY + deltaY, minPanY, maxPanY);
        applyCanvasView({ clamp: false });
        leaveFitWorldMode();
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
        canvas.addEventListener(eventName, (event) => {
            if (panStart && panStart.pointerId === event.pointerId) {
                panStart = null;
                canvas.classList.remove("is-panning");
                if (eventName !== "pointercancel") {
                    applyPanMomentum();
                }
            }
            if (eventName === "pointerleave") {
                clearPlacementState();
            }
        });
    });

    canvas.addEventListener("click", (event) => {
        if (suppressNextCanvasClick) {
            suppressNextCanvasClick = false;
            return;
        }

        if (event.button !== 0 || event.target.closest(".mark-dot") || event.target.closest(".canvas-hint")) {
            return;
        }

        hideMarkPopout();

        if (event.shiftKey || keyboardPanActive) {
            return;
        }

        const { x, y } = canvasPointFromEvent(event);

        setActiveTool(placeButton);
        setPlacement(x, y);
    });

    if (randomButton) {
        randomButton.addEventListener("click", () => {
            setActiveTool(randomButton);

            for (let attempt = 0; attempt < 80; attempt += 1) {
                const { x, y } = randomCoordinateInExploredTiles();

                if (!tooCloseToExistingMarks(x, y)) {
                    setPlacement(x, y);
                    focusCanvasOnCoordinate(x, y, 1.35);
                    placementNote.textContent = `Random spot: ${xField.value}px, ${yField.value}px`;
                    return;
                }
            }

            placementNote.classList.add("error");
            placementNote.textContent = "The wall is crowded here. Try choosing a spot manually.";
        });
    }

    canvas.addEventListener("touchstart", (event) => {
        if (event.target.closest(".canvas-hint") || event.target.closest(".mark-dot")) {
            return;
        }
        if (event.touches.length >= 2) {
            event.preventDefault();
            handlePinchStart(event.touches);
        }
    }, { passive: false });

    canvas.addEventListener("touchmove", (event) => {
        if (event.touches.length >= 2 && pinchState) {
            event.preventDefault();
            handlePinchMove(event.touches);
        }
    }, { passive: false });

    canvas.addEventListener("touchend", (event) => {
        if (event.touches.length < 2 && pinchState) {
            handlePinchEnd();
        }
    });

    canvas.addEventListener("touchcancel", (event) => {
        if (pinchState) {
            handlePinchEnd();
        }
    });

    canvas.addEventListener("wheel", (event) => {
        if (event.target.closest(".canvas-hint")) {
            return;
        }

        event.preventDefault();
        const direction = event.deltaY < 0 ? 1 : -1;
        const now = performance.now();
        if (direction === lastWheelZoomDirection && now - lastWheelZoomAt < wheelZoomCooldown) {
            return;
        }

        lastWheelZoomAt = now;
        lastWheelZoomDirection = direction;
        const rect = canvas.getBoundingClientRect();
        zoomCanvas(direction * zoomStep, {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        }, { duration: 140 });
    }, { passive: false });

    if (recentList) {
        recentList.addEventListener("click", (event) => {
            const button = event.target.closest("[data-recent-uid]");
            if (!button) {
                return;
            }

            const mark = marks.find((item) => item.dataset.uid === button.dataset.recentUid);
            canvas?.scrollIntoView({ block: "center", behavior: "smooth" });
            focusRecentMarkThroughClusters(mark);
        });
    }

    if (focusLatestButton) {
        focusLatestButton.addEventListener("click", () => {
            const latestUid = recentList?.querySelector("[data-recent-uid]")?.dataset.recentUid;
            const mark = latestUid
                ? marks.find((item) => item.dataset.uid === latestUid)
                : marks[marks.length - 1];
            focusRecentMarkThroughClusters(mark);
        });
    }

    window.addEventListener("resize", resetCanvasView);
    window.addEventListener("keydown", (event) => {
        if (isTextInputTarget(event.target)) {
            return;
        }

        if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            zoomCanvasByButton(1);
            return;
        }

        if (event.key === "-") {
            event.preventDefault();
            zoomCanvasByButton(-1);
            return;
        }

        if (event.key === "0") {
            event.preventDefault();
            resetCanvasView();
            return;
        }

        if (event.key === "1") {
            event.preventDefault();
            zoomCanvasTo(1);
            return;
        }

        if (event.key.toLowerCase() === "f") {
            event.preventDefault();
            fitWorldView();
            return;
        }

        if (keyboardPanActive && event.key.startsWith("Arrow")) {
            event.preventDefault();
            handleArrowPan(event.key);
            return;
        }

        if (event.key !== " " || isTextInputTarget(event.target)) {
            return;
        }

        event.preventDefault();
        keyboardPanActive = true;
        updatePanIntent();
    });
    window.addEventListener("keyup", (event) => {
        if (event.key !== " ") {
            return;
        }

keyboardPanActive = false;
        updatePanIntent();
    });
    resetCanvasView();

    function handleArrowPan(key) {
        const config = getInputConfig();
        const speed = config.arrowPanSpeed;
        let dx = 0;
        let dy = 0;

        switch (key) {
            case "ArrowUp": dy = speed; break;
            case "ArrowDown": dy = -speed; break;
            case "ArrowLeft": dx = speed; break;
            case "ArrowRight": dx = -speed; break;
            default: return;
        }

        cancelCanvasViewAnimation();
        cancelPanMomentum();

        const { minPanX, maxPanX, minPanY, maxPanY } = canvasPanBounds();
        canvasView.panX = rubberbandPan(canvasView.panX + dx, minPanX, maxPanX);
        canvasView.panY = rubberbandPan(canvasView.panY + dy, minPanY, maxPanY);
        applyCanvasView({ clamp: false });
        leaveFitWorldMode();
    }
}

if (form && formStatus) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        updateDrawingField();

        if (!xField.value || !yField.value) {
            formStatus.classList.add("error");
            formStatus.textContent = "Choose an open spot before placing your mark.";
            return;
        }

        submitButton.disabled = true;
        formStatus.classList.remove("error");
        formStatus.textContent = "Placing your mark...";

        try {
            const response = await fetch("/api/marks.php", {
                method: "POST",
                body: new FormData(form),
            });
            const payload = await response.json();

            if (!response.ok || !payload.ok) {
                throw new Error(payload.error || "Error saving your mark.");
            }

            const savedMark = apiMarkToView(payload.mark);
            addOrUpdateMark(savedMark, true);
            focusCanvasOnCoordinate(savedMark.x, savedMark.y, 1.45);
            await refreshRecentMarks();
            if (undoButton) {
                setUndoMarkAvailable(true, savedMark.uid);
            }
            form.reset();
            clearDrawing();
            updateShapePreviewColor();
            updateCharacterCounts();
            xField.value = "";
            yField.value = "";
            if (placementMarker) {
                placementMarker.hidden = true;
            }
            submitButton.textContent = "Choose a spot first";
            formStatus.textContent = "Mark placed.";
        } catch (error) {
            formStatus.classList.add("error");
            formStatus.textContent = error.message;
        } finally {
            submitButton.disabled = !xField.value || !yField.value;
        }
    });
}

if (undoButton && formStatus) {
    undoButton.addEventListener("click", async () => {
        const targetUid = undoButton.dataset.lastMarkUid || "";
        if (!undoMarkAvailable || targetUid === "") {
            setUndoMarkAvailable(false);
            return;
        }

        const targetMark = marks.find((mark) => mark.dataset.uid === targetUid);
        setUndoMarkAvailable(false);
        formStatus.classList.remove("error");
        formStatus.textContent = "Returning to your latest mark...";

        const body = new FormData();
        body.append("action", "undo");
        body.append("csrf_token", undoButton.dataset.csrfToken || "");

        try {
            if (targetMark) {
                hideMarkPopout();
                focusMark(targetMark, 1.65, { showPopout: false });
                await wait(620);
            }

            const response = await fetch("/api/marks.php", {
                method: "POST",
                body,
            });
            const payload = await response.json();

            if (!response.ok || !payload.ok) {
                throw new Error(payload.error || "Unable to undo your latest mark.");
            }

            formStatus.textContent = "Removing your latest mark...";
            if (targetMark) {
                await animateUndoMark(targetMark);
                removeMarkElement(targetMark);
            } else {
                await refreshRecentMarks();
            }
            await refreshRecentMarks();
            setUndoMarkAvailable(false);
            formStatus.textContent = "Latest mark removed.";
        } catch (error) {
            targetMark?.classList.remove("is-undoing");
            formStatus.classList.add("error");
            formStatus.textContent = error.message;
            setUndoMarkAvailable(false);
        }
    });
}

document.addEventListener("click", (event) => {
    if (!markPopout || markPopout.hidden) {
        return;
    }

    if (suppressNextDocumentClick) {
        suppressNextDocumentClick = false;
        return;
    }

    if (event.target.closest("[data-mark-popout]") || event.target.closest(".mark-dot") || event.target.closest("[data-recent-uid]")) {
        return;
    }

    hideMarkPopout();
});

startLiveUpdates();
