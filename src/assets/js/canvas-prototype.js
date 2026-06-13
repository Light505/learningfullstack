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
const largeMarkDomThreshold = 1000;

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
let renderedMarkClusterStateSignature = "";
let renderedMarkViewportSignature = "";
let committedClusterLevelIndex = null;
let pendingClusterTransition = null;
let previousMarkClusterCenter = new Map();
let clusterCache = [];
let clusterCacheSignature = "";
let clusterHierarchyCache = null;
let clusterHierarchySignature = "";
let clusterItemsCache = null;
let clusterItemsCacheVersion = -1;
let persistedClusters = [];
let persistedClusterMemberships = [];
let hasPersistedClusterPayload = false;
let activeClusterExpansion = null;
let recentFocusToken = 0;
let recentFocusSequenceActive = false;
let recentFocusPopupMode = null;
let selectedMarkElement = null;
const markPositions = new Map();
const marksByUid = new Map(marks.map((mark) => [mark.dataset.uid, mark]));
const markDrawingRequests = new Map();
const renderedTileElements = new Map();
const renderedMarkUids = new Set();
const markSpatialIndex = new Map();
let marksVersion = 0;
let exploredTilesVersion = 0;
let clusterDataVersion = 0;
let worldGeometryVersion = 0;
let markSpatialIndexDirty = true;
let deferredMarkRenderRefresh = null;
let _cachedCanvasRect = null;
let _lastZoomReadoutText = null;
let _lastZoomOutDisabled = null;
let _lastZoomInDisabled = null;
let clusterLayerIntegrityTimer = null;
let largeClusteredMapUnmountRefreshTimer = null;
let deferredMarkUnmountFrame = null;
const deferredMarkUnmountQueue = [];
const deferredMarkUnmountUids = new Set();
let coalescingCleanupTimer = null;
let expandingCleanupTimer = null;
let clusteredMarkCount = 0;
let clusteredMarkUids = new Set();
const coalescingCleanupMarks = new Set();
const expandingCleanupMarks = new Set();
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
let pinchState = null;

function isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

function closestElement(target, selector) {
    if (target?.closest) {
        return target.closest(selector);
    }

    return target?.parentElement?.closest(selector) || null;
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

    const { friction, minVelocity, maxVelocity } = momentumConfig;
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

function invalidateClusterState() {
    clusterCacheSignature = "";
    renderedClusterSignature = "";
    renderedMarkClusterStateSignature = "";
}

function invalidateClusterHierarchy() {
    clusterHierarchySignature = "";
    clusterHierarchyCache = null;
}

function markCollectionChanged() {
    marksVersion += 1;
    invalidateClusterHierarchy();
    invalidateClusterState();
}

function addExploredTile(key) {
    if (exploredTiles.has(key)) {
        return false;
    }

    exploredTiles.add(key);
    exploredTilesVersion += 1;
    return true;
}

function updateWorldBounds() {
    const previousBounds = worldBounds;
    worldBounds = {
        minX: minTileIndex * tileSize,
        maxX: (maxTileIndex + 1) * tileSize,
        minY: minTileIndex * tileSize,
        maxY: (maxTileIndex + 1) * tileSize,
    };

    if (previousBounds.minX !== worldBounds.minX
        || previousBounds.maxX !== worldBounds.maxX
        || previousBounds.minY !== worldBounds.minY
        || previousBounds.maxY !== worldBounds.maxY) {
        worldGeometryVersion += 1;
    }
}

function revealTileAndNeighbors(tileX, tileY) {
    for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
            const nx = tileX + dx;
            const ny = tileY + dy;
            if (nx >= minTileIndex && nx <= maxTileIndex && ny >= minTileIndex && ny <= maxTileIndex) {
                addExploredTile(`${nx},${ny}`);
            }
        }
    }
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

function randomCoordinateInExploredTiles() {
    const tileKeys = placeableTileKeys();
    const [tileX, tileY] = tileKeys[Math.floor(Math.random() * tileKeys.length)].split(",").map(Number);

    return {
        x: (tileX * tileSize) + (Math.random() * tileSize),
        y: (tileY * tileSize) + (Math.random() * tileSize),
    };
}

function placeableTileKeys() {
    return Array.from(exploredTiles).filter((key) => {
        const [tileX, tileY] = key.split(",").map(Number);

        return isTileInsideCoordinateBounds(tileX, tileY);
    });
}

function matchesCurrentPlacement(x, y) {
    return xField
        && yField
        && xField.value === x.toFixed(2)
        && yField.value === y.toFixed(2);
}

function firstAvailableCoordinateInExploredTiles() {
    const fractions = [0.2, 0.5, 0.8, 0.35, 0.65];
    const tileKeys = placeableTileKeys().sort();

    for (const key of tileKeys) {
        const [tileX, tileY] = key.split(",").map(Number);
        for (const xFraction of fractions) {
            for (const yFraction of fractions) {
                const x = (tileX * tileSize) + (xFraction * tileSize);
                const y = (tileY * tileSize) + (yFraction * tileSize);
                if (!tooCloseToExistingMarks(x, y) && !matchesCurrentPlacement(x, y)) {
                    return { x, y };
                }
            }
        }
    }

    return null;
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
        exploredTilesVersion,
        renderTileKeys.join("|"),
        worldBounds.minX,
        worldBounds.minY,
        worldGeometryVersion,
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
    const signature = [
        renderMode,
        worldBounds.minX,
        worldBounds.minY,
        worldWidth,
        worldHeight,
        exploredTilesVersion,
        worldGeometryVersion,
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
    const position = markPosition(mark);
    const x = position?.x;
    const y = position?.y;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    return { uid: mark.dataset.uid, mark, x, y };
}

function markClusterItems() {
    if (clusterItemsCache !== null && clusterItemsCacheVersion === marksVersion) {
        return clusterItemsCache;
    }
    clusterItemsCache = marks.map(markToClusterItem).filter(Boolean);
    clusterItemsCacheVersion = marksVersion;
    return clusterItemsCache;
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
        const position = markPosition(mark);
        const x = position?.x;
        const y = position?.y;
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

function groupRawItemsByRadius(items, radius) {
    const cell = radius || 1;
    const radiusSquared = cell * cell;
    const grid = new Map();
    const cellKey = (cx, cy) => (cx + 500000) * 1000000 + (cy + 500000);
    const indexedItems = items.map((item, index) => ({ item, index }));

    indexedItems.forEach((entry) => {
        const cx = Math.floor(entry.item.x / cell);
        const cy = Math.floor(entry.item.y / cell);
        const key = cellKey(cx, cy);
        const bucket = grid.get(key);
        if (bucket) {
            bucket.push(entry);
        } else {
            grid.set(key, [entry]);
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

    indexedItems.forEach((entry) => {
        parent.set(entry.item.uid, entry.item.uid);
    });

    indexedItems.forEach((seedEntry) => {
        const seed = seedEntry.item;
        const scx = Math.floor(seed.x / cell);
        const scy = Math.floor(seed.y / cell);

        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                const bucket = grid.get(cellKey(scx + dx, scy + dy));
                if (!bucket) {
                    continue;
                }
                bucket.forEach((candidateEntry) => {
                    if (candidateEntry.index <= seedEntry.index) {
                        return;
                    }
                    const candidate = candidateEntry.item;
                    const xDistance = candidate.x - seed.x;
                    const yDistance = candidate.y - seed.y;
                    if ((xDistance * xDistance) + (yDistance * yDistance) <= radiusSquared) {
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

function clusterMarksForRadius(items, radius) {
    return groupRawItemsByRadius(items, radius)
        .map((members) => makeClusterNode(members));
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
    invalidateClusterState();
}

function activeClusterLevel() {
    return clusterLevels[clusterLevelIndex()] || null;
}

function resetClusterDrilldown() {
    activeClusterExpansion = null;
    pendingClusterTransition = null;
    renderedClusterSignature = "";
    renderedMarkClusterStateSignature = "";
}

function clusterSignature() {
    return `${clusterLevelIndex()}|${marksVersion}|${clusterDataVersion}`;
}

function currentClusters() {
    const signature = clusterSignature();
    if (signature !== clusterCacheSignature) {
        const levelIndex = clusterLevelIndex();
        clusterCacheSignature = signature;

        const hierarchy = fullClusterHierarchy();

        let result = null;
        for (let i = levelIndex; i < clusterLevels.length; i += 1) {
            if (hierarchy[i] && hierarchy[i].length > 0) {
                result = hierarchy[i];
                break;
            }
        }
        clusterCache = result || markClusterItemsForDrilldown().map((item) => makeClusterNode([item], "mark"));
    }

    return clusterCache;
}

function buildFullClusterHierarchy(items) {
    if (items.length === 0) {
        return [makeEmptyHierarchy(), makeEmptyHierarchy(), makeEmptyHierarchy(), makeEmptyHierarchy()];
    }

    const sorted = [...items].sort((a, b) => a.uid.localeCompare(b.uid));
    const neighborGroups = clusterMarksForRadius(sorted, clusterLevels[3].radius);
    let remainingLoneItems = neighborGroups
        .filter((cluster) => cluster.count === 1)
        .map((cluster) => markToClusterItem(cluster.marks[0]))
        .filter(Boolean)
        .sort((a, b) => a.uid.localeCompare(b.uid));

    let neighbors = neighborGroups
        .filter((cluster) => cluster.count >= 2)
        .map((n) => ({ ...n, level: "neighbor" }));
    ({ clusters: neighbors, remainingLoneItems } = absorbLoneItemsIntoClusters(neighbors, remainingLoneItems, clusterLevels[3]));

    const systemPromotion = promoteChildClusters(neighbors, clusterLevels[2]);
    ({ clusters: systemPromotion.parents, remainingLoneItems } = absorbLoneItemsIntoClusters(systemPromotion.parents, remainingLoneItems, clusterLevels[2]));

    const galaxyPromotion = promoteChildClusters(systemPromotion.parents, clusterLevels[1]);
    ({ clusters: galaxyPromotion.parents, remainingLoneItems } = absorbLoneItemsIntoClusters(galaxyPromotion.parents, remainingLoneItems, clusterLevels[1]));

    const superPromotion = promoteChildClusters(galaxyPromotion.parents, clusterLevels[0]);
    ({ clusters: superPromotion.parents } = absorbLoneItemsIntoClusters(superPromotion.parents, remainingLoneItems, clusterLevels[0]));

    return [
        [...superPromotion.parents, ...superPromotion.carried, ...galaxyPromotion.carried, ...systemPromotion.carried],
        [...galaxyPromotion.parents, ...galaxyPromotion.carried, ...systemPromotion.carried],
        [...systemPromotion.parents, ...systemPromotion.carried],
        neighbors,
    ];
}

function rebuildClusterWithMarks(cluster, markElements, levelKey) {
    return {
        ...makeClusterNode(itemsFromMarkElements(markElements)),
        level: levelKey,
        marks: markElements,
    };
}

function absorbLoneItemsIntoClusters(clusters, loneItems, level) {
    if (clusters.length === 0 || loneItems.length === 0) {
        return { clusters, remainingLoneItems: loneItems };
    }

    const nextClusters = clusters.map((cluster) => ({
        ...cluster,
        marks: [...cluster.marks],
    }));
    const cell = level.radius || 1;
    const radiusSquared = level.radius * level.radius;
    const cellKey = (cx, cy) => `${cx},${cy}`;
    const indexedClusters = nextClusters.map((cluster, index) => ({
        cluster,
        index,
        cx: Math.floor(cluster.x / cell),
        cy: Math.floor(cluster.y / cell),
    }));
    const grid = new Map();
    const removeIndexedCluster = (entry) => {
        const key = cellKey(entry.cx, entry.cy);
        const bucket = grid.get(key);
        if (!bucket) {
            return;
        }
        const offset = bucket.indexOf(entry);
        if (offset !== -1) {
            bucket.splice(offset, 1);
        }
        if (bucket.length === 0) {
            grid.delete(key);
        }
    };
    const addIndexedCluster = (entry) => {
        entry.cx = Math.floor(entry.cluster.x / cell);
        entry.cy = Math.floor(entry.cluster.y / cell);
        const key = cellKey(entry.cx, entry.cy);
        const bucket = grid.get(key);
        if (bucket) {
            bucket.push(entry);
        } else {
            grid.set(key, [entry]);
        }
    };

    indexedClusters.forEach(addIndexedCluster);
    const remainingLoneItems = [];

    loneItems.forEach((item) => {
        const itemCx = Math.floor(item.x / cell);
        const itemCy = Math.floor(item.y / cell);
        let target = null;

        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                const bucket = grid.get(cellKey(itemCx + dx, itemCy + dy));
                if (!bucket) {
                    continue;
                }
                bucket.forEach((entry) => {
                    const xDistance = item.x - entry.cluster.x;
                    const yDistance = item.y - entry.cluster.y;
                    const distanceSquared = (xDistance * xDistance) + (yDistance * yDistance);
                    if (distanceSquared > radiusSquared) {
                        return;
                    }
                    if (!target
                        || distanceSquared < target.distanceSquared
                        || distanceSquared === target.distanceSquared && entry.cluster.id.localeCompare(target.entry.cluster.id) < 0) {
                        target = { entry, distanceSquared };
                    }
                });
            }
        }

        if (!target) {
            remainingLoneItems.push(item);
            return;
        }

        removeIndexedCluster(target.entry);
        const markElements = [...target.entry.cluster.marks, item.mark];
        const rebuiltCluster = rebuildClusterWithMarks(target.entry.cluster, markElements, level.key);
        nextClusters[target.entry.index] = rebuiltCluster;
        target.entry.cluster = rebuiltCluster;
        addIndexedCluster(target.entry);
    });

    return { clusters: nextClusters, remainingLoneItems };
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

function itemsFromMarkElements(markElements) {
    return markElements
        .map((mark) => {
            const position = markPosition(mark);
            const x = position?.x;
            const y = position?.y;
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

function clusterLevelKey(levelIndex) {
    return clusterLevels[levelIndex]?.key || null;
}

function persistedClusterMembers(clusterUid, levelKey, allowedUids = null) {
    const allowed = allowedUids ? new Set(allowedUids) : null;
    const memberUids = persistedClusterMemberships
        .filter((membership) => membership.cluster_uid === clusterUid && membership.level === levelKey)
        .map((membership) => membership.mark_uid);

    return memberUids
        .filter((uid) => allowed === null || allowed.has(uid))
        .map(markByUid)
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
    if (!previousCenters) {
        return null;
    }

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

function structuralParentCentersByUid(parentLevelIndex) {
    if (parentLevelIndex < 0 || parentLevelIndex >= clusterLevels.length) {
        return null;
    }

    const centers = new Map();
    structuralClustersForLevelIndex(markClusterItems(), parentLevelIndex)
        .filter((candidate) => candidate.level === clusterLevels[parentLevelIndex].key)
        .forEach((candidate) => {
            candidate.marks.forEach((mark) => {
                centers.set(mark.dataset.uid, { x: candidate.x, y: candidate.y });
            });
        });

    return centers;
}

function clusterContainsAnyUid(cluster, uidSet) {
    if (!uidSet) {
        return true;
    }

    return cluster.marks.some((mark) => uidSet.has(mark.dataset.uid));
}

function setClusterTransitionMode(mode, duration = 620) {
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

function clusterExpansionDuration() {
    return 970;
}

function startClusterExpansionState(cluster, levelIndex, duration = clusterExpansionDuration()) {
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
    const duration = clusterExpansionDuration();
    startClusterExpansionState(cluster, currentLevelIdx, duration);

    cluster.marks.forEach((mark) => {
        const position = markPosition(mark);
        const x = position?.x;
        const y = position?.y;
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
        scheduleMarkRenderRefresh();
    }, duration);
}

function fullClusterHierarchy() {
    const signature = `${marksVersion}|${clusterDataVersion}`;
    if (signature !== clusterHierarchySignature || clusterHierarchyCache === null) {
        clusterHierarchySignature = signature;
        clusterHierarchyCache = buildFullClusterHierarchy(markClusterItems());
    }

    return clusterHierarchyCache;
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
    const animationDuration = Math.max(clusterExpansionDuration(), cameraDuration + settleDuration);
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
                        const position = markPosition(mark);
                        const x = position?.x;
                        const y = position?.y;
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
                        scheduleMarkRenderRefresh();
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
    const selectedUid = selectedCanvasMark()?.dataset.uid || "";
    const transition = pendingClusterTransition;
    const zoomingOut = transition?.direction === "out";
    const zoomingIn = transition?.direction === "in";
    const clusterStateSignature = clusterCacheSignature;
    const shouldUpdateMarkClusterState = Boolean(transition)
        || clusterStateSignature !== renderedMarkClusterStateSignature;

    if (shouldUpdateMarkClusterState) {
        const coveredUids = new Set();
        const markClusterCenter = new Map();
        bubbles.forEach((cluster) => {
            cluster.marks.forEach((mark) => {
                coveredUids.add(mark.dataset.uid);
                markClusterCenter.set(mark.dataset.uid, { x: cluster.x, y: cluster.y });
            });
        });
        clusteredMarkCount = coveredUids.size;
        clusteredMarkUids = coveredUids;

        if (transition) {
            marks.forEach((mark) => {
                const shouldCluster = coveredUids.has(mark.dataset.uid);
                const wasClustered = mark.classList.contains("is-clustered");

                mark.classList.toggle("is-clustered", shouldCluster);

                if (shouldCluster && (!wasClustered || zoomingOut)) {
                    const center = markClusterCenter.get(mark.dataset.uid);
                    if (center) {
                        const position = markPosition(mark);
                        const mx = position?.x;
                        const my = position?.y;
                        mark.style.setProperty("--coalesce-x", `${center.x - mx}px`);
                        mark.style.setProperty("--coalesce-y", `${center.y - my}px`);
                    }
                    mark.dataset.coalescing = "true";
                    scheduleCoalescingCleanup(mark);
                }

                if (!shouldCluster && (wasClustered || zoomingIn)) {
                    const oldCenter = previousMarkClusterCenter.get(mark.dataset.uid);
                    if (oldCenter) {
                        const position = markPosition(mark);
                        const mx = position?.x;
                        const my = position?.y;
                        mark.style.setProperty("--mark-expand-x", `${oldCenter.x - mx}px`);
                        mark.style.setProperty("--mark-expand-y", `${oldCenter.y - my}px`);
                        mark.style.setProperty("--mark-expand-scale", "0.08");
                    }
                    mark.dataset.expanding = "true";
                    scheduleExpandingCleanup(mark);
                }
            });
        } else {
            previousMarkClusterCenter.forEach((_center, uid) => {
                if (!coveredUids.has(uid)) {
                    markByUid(uid)?.classList.remove("is-clustered");
                }
            });
            coveredUids.forEach((uid) => {
                markByUid(uid)?.classList.add("is-clustered");
            });
        }

        previousMarkClusterCenter = markClusterCenter;
        renderedMarkClusterStateSignature = clusterStateSignature;
    }

    if (marks.length > largeMarkDomThreshold
        && canvas?.dataset.renderMode !== "detail"
        && !selectedCanvasMark()
        && clusteredMarkCount >= marks.length) {
        scheduleLargeClusteredMapUnmountRefresh();
    }

    const hasActiveExpansion = activeClusterExpansion && activeClusterExpansion.until > performance.now();
    const activeExpansionSignature = hasActiveExpansion
        ? `${activeClusterExpansion.x}:${activeClusterExpansion.y}:${activeClusterExpansion.strength}:${activeClusterExpansion.until}`
        : "";
    const signature = `${clusterStateSignature}:${worldGeometryVersion}:${selectedUid}:${activeExpansionSignature}`;
    if (signature === renderedClusterSignature && (bubbles.length === 0 || mapClusters.children.length > 0)) {
        pendingClusterTransition = null;
        return;
    }
    renderedClusterSignature = signature;

    const transitionMode = zoomingOut
        ? "coalesce"
        : zoomingIn || hasActiveExpansion
            ? "explode"
            : null;

    if (transitionMode) {
        clearClusterTransitionMode();
        setClusterTransitionMode(transitionMode, 620);
    } else {
        clearClusterTransitionMode();
    }

    mapClusters.innerHTML = "";
    const structuralParentCenters = transition ? structuralParentCentersByUid(transition.from) : null;
    bubbles.forEach((cluster) => {
        const count = cluster.count;
        const shape = mapClusterShape(cluster);
        const size = Math.min(46, 18 + (Math.sqrt(count) * 7));
        const buttonLevelKey = cluster.level || level?.key || "marks";
        const buttonLevel = clusterLevels.find((item) => item.key === buttonLevelKey) || level;

        const button = document.createElement("button");
        button.type = "button";
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            if (count === 1) {
                focusMark(cluster.marks[0], 1.45);
                return;
            }
            zoomIntoCluster(cluster);
        });

        const levelWeight = Math.max(0, clusterLevels.findIndex((item) => item.key === buttonLevelKey));
        const expanding = activeClusterExpansion
            && activeClusterExpansion.until > performance.now()
            && clusterContainsAnyUid(cluster, activeClusterExpansion.uids);
        const transitionFrom = zoomingOut || zoomingIn
            ? averagePreviousChildClusterCenter(cluster, previousClusterCenters)
                || averagePreviousChildClusterCenter(cluster, structuralParentCenters)
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
        const className = count > 1
            ? `map-cluster ${shape} is-multi${levelClass}`
            : `map-cluster ${shape}`;
        if (button.className !== className) {
            button.className = className;
        }
        setStylePropertyIfChanged(button, "--cluster-x", `${cluster.x - worldBounds.minX}px`);
        setStylePropertyIfChanged(button, "--cluster-y", `${cluster.y - worldBounds.minY}px`);
        setStylePropertyIfChanged(button, "--cluster-screen-size", `${size}px`);
        setStylePropertyIfChanged(button, "--cluster-color", mapClusterColor(cluster));
        setStylePropertyIfChanged(button, "--cluster-expand-x", `${expandFrom.x}px`);
        setStylePropertyIfChanged(button, "--cluster-expand-y", `${expandFrom.y}px`);
        setStylePropertyIfChanged(button, "--cluster-expand-scale", String(Math.max(0.18, 0.55 - (expandFrom.strength * 0.05))));
        setStylePropertyIfChanged(button, "--cluster-pulse-scale", String(Math.max(0.28, 0.62 - (levelWeight * 0.07))));
        setStylePropertyIfChanged(button, "--cluster-pulse-ring", `${8 + (levelWeight * 5)}px`);
        button.dataset.count = String(count);
        button.dataset.clusterId = cluster.id;
        button.dataset.clusterLevel = buttonLevelKey;
        button.setAttribute("aria-pressed", "false");
        if (selectedUid && cluster.marks.some((mark) => mark.dataset.uid === selectedUid)) {
            button.dataset.selectedCluster = "true";
            button.setAttribute("aria-current", "true");
        } else {
            delete button.dataset.selectedCluster;
            button.removeAttribute("aria-current");
        }

        if (count > 1) {
            const levelLabel = buttonLevelKey === "neighbor" ? "N"
                : buttonLevelKey === "system" ? "S"
                : buttonLevelKey === "galaxy" ? "G"
                : buttonLevelKey === "supercluster" ? "SC"
                : "";
            if (button.textContent !== String(count)) {
                button.textContent = String(count);
            }
            button.dataset.levelLabel = levelLabel;
            button.setAttribute("aria-label", `Zoom in to ${count} marks in this ${buttonLevel?.label || "cluster"}`);
        } else {
            button.setAttribute("aria-label", `View mark by ${cluster.marks[0].dataset.name}`);
        }

        mapClusters.appendChild(button);
    });

    pendingClusterTransition = null;
}

function applyWorldGeometry() {
    if (!canvas) {
        return;
    }

    setStylePropertyIfChanged(canvas, "--canvas-world-width", `${worldBounds.maxX - worldBounds.minX}px`);
    setStylePropertyIfChanged(canvas, "--canvas-world-height", `${worldBounds.maxY - worldBounds.minY}px`);
    renderCanvasTiles();
}

function coordinateToWorldPercent(coordinate) {
    return ((coordinate - worldBounds.minX) / (worldBounds.maxX - worldBounds.minX)) * 100;
}

function coordinateYToWorldPercent(coordinate) {
    return ((coordinate - worldBounds.minY) / (worldBounds.maxY - worldBounds.minY)) * 100;
}

function positionMarkElement(mark) {
    const position = markPosition(mark);
    const x = position?.x;
    const y = position?.y;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
    }

    const signature = `${worldGeometryVersion}:${x}:${y}`;
    if (mark.dataset.positionSignature === signature) {
        return;
    }

    setStylePropertyIfChanged(mark, "--mark-x", `${coordinateToWorldPercent(x)}%`);
    setStylePropertyIfChanged(mark, "--mark-y", `${coordinateYToWorldPercent(y)}%`);
    mark.dataset.positionSignature = signature;
}

function positionAllMarks() {
    marks.forEach(positionMarkElement);
    positionPlacementMarker();
}

function positionPlacementMarker() {
    if (placementMarker && xField?.value && yField?.value) {
        const rect = _cachedCanvasRect || canvas.getBoundingClientRect();
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

    const rect = _cachedCanvasRect || canvas.getBoundingClientRect();
    const anchor = selectedMarkPopoutAnchor(selectedMark);
    if (!anchor) {
        return;
    }

    const compact = markPopout.dataset.state === "compact";
    const xPadding = compact ? 18 : 170;
    const yMin = compact ? 18 : 132;
    const yMax = compact ? rect.height - 18 : rect.height - 18;
    const clampedX = Math.max(xPadding, Math.min(rect.width - xPadding, anchor.position.x));
    const clampedY = Math.max(yMin, Math.min(yMax, anchor.position.y));

    markPopout.style.setProperty("--popout-x", `${(clampedX / rect.width) * 100}%`);
    markPopout.style.setProperty("--popout-y", `${(clampedY / rect.height) * 100}%`);
}

function screenPositionForCoordinate(x, y) {
    if (!canvas || !Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    return {
        x: canvasView.panX + ((x - worldBounds.minX) * canvasView.zoom),
        y: canvasView.panY + ((y - worldBounds.minY) * canvasView.zoom),
    };
}

function selectedMarkScreenPosition(mark) {
    if (!mark) {
        return null;
    }

    const position = markPosition(mark);
    const x = position?.x;
    const y = position?.y;
    return screenPositionForCoordinate(x, y);
}

function positionIsInsideCanvasViewport(position) {
    if (!canvas || !position) {
        return false;
    }

    const rect = _cachedCanvasRect || canvas.getBoundingClientRect();
    return position.x >= 0
        && position.x <= rect.width
        && position.y >= 0
        && position.y <= rect.height;
}

function selectedMarkIsInsideCanvasViewport(mark) {
    const position = selectedMarkScreenPosition(mark);
    return positionIsInsideCanvasViewport(position);
}

function activeClusterForSelectedMark(mark) {
    const uid = markUid(mark);
    if (!uid) {
        return null;
    }

    return currentClusters().find((cluster) => (
        cluster.count > 1
        && cluster.marks.some((clusterMark) => markUid(clusterMark) === uid)
    )) || null;
}

function selectedMarkPopoutAnchor(mark) {
    const shouldUseClusterAnchor = canvas?.dataset.renderMode !== "detail"
        || mark.classList.contains("is-clustered");
    const cluster = shouldUseClusterAnchor
        ? activeClusterForSelectedMark(mark)
        : null;

    if (cluster) {
        return {
            target: "cluster",
            cluster,
            position: screenPositionForCoordinate(cluster.x, cluster.y),
        };
    }

    return {
        target: "mark",
        cluster: null,
        position: selectedMarkScreenPosition(mark),
    };
}

function updateSelectedMarkPopout() {
    if (!canvas || !markPopout) {
        return;
    }

    const selectedMark = selectedCanvasMark();
    if (!selectedMark) {
        hideMarkPopout();
        return;
    }

    if (recentFocusPopupMode === "hidden") {
        hideMarkPopout();
        return;
    }

    const anchor = selectedMarkPopoutAnchor(selectedMark);
    if (!anchor || !anchor.position) {
        hideMarkPopout();
        return;
    }

    markPopout.dataset.locatorTarget = anchor.target;

    if (anchor.target === "cluster") {
        if (positionIsInsideCanvasViewport(anchor.position)) {
            hideMarkPopout();
            return;
        }

        markPopout.hidden = false;
        markPopout.dataset.state = "compact";
        positionMarkPopout();
        return;
    }

    markPopout.hidden = false;
    if (!positionIsInsideCanvasViewport(anchor.position)
        || canvasView.zoom < 0.72
        || recentFocusPopupMode === "compact") {
        markPopout.dataset.state = "compact";
    } else {
        markPopout.dataset.state = "full";
    }
    positionMarkPopout();
}

function cacheMarkPosition(mark) {
    const x = Number.parseFloat(mark.dataset.x || "0");
    const y = Number.parseFloat(mark.dataset.y || "0");
    markPositions.set(mark.dataset.uid, { x, y });
    markSpatialIndexDirty = true;
    delete mark.dataset.positionSignature;
    return { x, y };
}

function markPosition(mark) {
    if (!mark?.dataset?.uid) {
        return null;
    }

    return markPositions.get(mark.dataset.uid) || cacheMarkPosition(mark);
}

function rebuildMarkPositionCache() {
    markPositions.clear();
    marks.forEach(cacheMarkPosition);
}

function rebuildMarksByUid() {
    marksByUid.clear();
    marks.forEach((mark) => {
        marksByUid.set(mark.dataset.uid, mark);
    });
}

function markSpatialCellKey(cx, cy) {
    return `${cx},${cy}`;
}

function markSpatialCellForPosition(position) {
    return {
        cx: Math.floor(position.x / tileSize),
        cy: Math.floor(position.y / tileSize),
    };
}

function rebuildMarkSpatialIndex() {
    markSpatialIndex.clear();
    marks.forEach((mark) => {
        const position = markPosition(mark);
        if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) {
            return;
        }
        const cell = markSpatialCellForPosition(position);
        const key = markSpatialCellKey(cell.cx, cell.cy);
        const bucket = markSpatialIndex.get(key);
        if (bucket) {
            bucket.push(mark);
        } else {
            markSpatialIndex.set(key, [mark]);
        }
    });
    markSpatialIndexDirty = false;
}

function marksInBounds(bounds, skipUids) {
    if (markSpatialIndexDirty) {
        rebuildMarkSpatialIndex();
    }

    const minCellX = Math.floor(bounds.minX / tileSize);
    const maxCellX = Math.floor(bounds.maxX / tileSize);
    const minCellY = Math.floor(bounds.minY / tileSize);
    const maxCellY = Math.floor(bounds.maxY / tileSize);
    const result = [];
    const seen = new Set();

    for (let cx = minCellX; cx <= maxCellX; cx += 1) {
        for (let cy = minCellY; cy <= maxCellY; cy += 1) {
            const bucket = markSpatialIndex.get(markSpatialCellKey(cx, cy));
            if (!bucket) {
                continue;
            }
            bucket.forEach((mark) => {
                const uid = mark.dataset.uid;
                if (skipUids && skipUids.has(uid)) {
                    return;
                }
                if (!seen.has(uid) && markIsInsideBounds(mark, bounds)) {
                    seen.add(uid);
                    result.push(mark);
                }
            });
        }
    }

    return result;
}

function markViewportSignature(bounds, renderMode, selectedMark) {
    const minCellX = Math.floor(bounds.minX / tileSize);
    const maxCellX = Math.floor(bounds.maxX / tileSize);
    const minCellY = Math.floor(bounds.minY / tileSize);
    const maxCellY = Math.floor(bounds.maxY / tileSize);

    return [
        renderMode,
        marksVersion,
        renderedMarkClusterStateSignature,
        selectedMark?.dataset.uid || "",
        minCellX,
        maxCellX,
        minCellY,
        maxCellY,
        coalescingCleanupMarks.size,
        expandingCleanupMarks.size,
        coalescingCleanupTimer === null ? "clean" : "coalescing",
        expandingCleanupTimer === null ? "clean" : "expanding",
    ].join("|");
}

function setStylePropertyIfChanged(element, property, value) {
    if (element.style.getPropertyValue(property) !== value) {
        element.style.setProperty(property, value);
    }
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
    const position = markPosition(mark);
    const x = position?.x;
    const y = position?.y;

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
    if (mark?.parentElement) {
        mark.remove();
    }
}

function mountedMarkElements() {
    const result = [];
    renderedMarkUids.forEach((uid) => {
        const mark = markByUid(uid);
        if (mark) {
            result.push(mark);
        }
    });
    return result;
}

function updateRenderedMarkCountDataset() {
    if (canvas) {
        canvas.dataset.markCulling = "viewport";
        canvas.dataset.renderedMarkCount = String(renderedMarkUids.size);
        canvas.dataset.totalMarkCount = String(marks.length);
    }
}

function processDeferredMarkUnmounts() {
    deferredMarkUnmountFrame = null;
    const startedAt = performance.now();
    const selectedMark = selectedCanvasMark();

    while (deferredMarkUnmountQueue.length > 0 && performance.now() - startedAt < 4) {
        const uid = deferredMarkUnmountQueue.shift();
        if (!deferredMarkUnmountUids.delete(uid)) {
            continue;
        }
        const mark = markByUid(uid);
        if (!mark || mark === selectedMark) {
            continue;
        }
        unmountMark(mark);
        renderedMarkUids.delete(uid);
    }

    updateRenderedMarkCountDataset();

    if (deferredMarkUnmountQueue.length > 0) {
        deferredMarkUnmountFrame = window.setTimeout(processDeferredMarkUnmounts, 0);
    }
}

function scheduleDeferredMarkUnmount(uid) {
    if (!uid || deferredMarkUnmountUids.has(uid)) {
        return;
    }

    deferredMarkUnmountUids.add(uid);
    deferredMarkUnmountQueue.push(uid);
    if (deferredMarkUnmountFrame === null) {
        deferredMarkUnmountFrame = window.setTimeout(processDeferredMarkUnmounts, 0);
    }
}

function unmountMountedMarksForLargeMap(mountedMarks, selectedMark = null) {
    let removed = 0;

    mountedMarks.forEach((mark) => {
        if (!mark || mark === selectedMark) {
            return;
        }

        const uid = mark.dataset.uid;
        deferredMarkUnmountUids.delete(uid);
        renderedMarkUids.delete(uid);
        unmountMark(mark);
        removed += 1;
    });

    if (removed > 0) {
        updateRenderedMarkCountDataset();
    }

    return removed;
}

function scheduleMarkRenderRefresh() {
    if (deferredMarkRenderRefresh !== null) {
        return;
    }

    deferredMarkRenderRefresh = window.setTimeout(() => {
        deferredMarkRenderRefresh = null;
        renderMarksForViewport();
    }, 0);
}

function scheduleClusterLayerIntegrityCheck() {
    if (clusterLayerIntegrityTimer !== null) {
        return;
    }

    clusterLayerIntegrityTimer = window.setTimeout(() => {
        clusterLayerIntegrityTimer = null;
        if (!mapClusters || mapClusters.children.length > 0) {
            return;
        }

        if (currentClusters().some((cluster) => cluster.count > 1)) {
            renderedClusterSignature = "";
            renderMapClusters();
        }
    }, 900);
}

function scheduleLargeClusteredMapUnmountRefresh() {
    if (largeClusteredMapUnmountRefreshTimer !== null) {
        return;
    }

    largeClusteredMapUnmountRefreshTimer = window.setTimeout(() => {
        largeClusteredMapUnmountRefreshTimer = null;
        if (!canvasWorld || canvas?.dataset.renderMode === "detail") {
            return;
        }

        const selectedMark = selectedCanvasMark();
        unmountMountedMarksForLargeMap(mountedMarkElements(), selectedMark);
    }, 700);
}

function startLargeMapMarkDomCleanup() {
    if (!canvasWorld || canvas?.dataset.renderMode === "detail") {
        return;
    }

    const selectedMark = selectedCanvasMark();
    unmountMountedMarksForLargeMap(mountedMarkElements(), selectedMark);
}

function scheduleCoalescingCleanup(mark) {
    coalescingCleanupMarks.add(mark);
    if (coalescingCleanupTimer !== null) {
        return;
    }

    coalescingCleanupTimer = window.setTimeout(() => {
        coalescingCleanupTimer = null;
        coalescingCleanupMarks.forEach((item) => {
            delete item.dataset.coalescing;
            item.style.removeProperty("--coalesce-x");
            item.style.removeProperty("--coalesce-y");
        });
        coalescingCleanupMarks.clear();
        scheduleMarkRenderRefresh();
    }, 400);
}

function scheduleExpandingCleanup(mark) {
    expandingCleanupMarks.add(mark);
    if (expandingCleanupTimer !== null) {
        return;
    }

    expandingCleanupTimer = window.setTimeout(() => {
        expandingCleanupTimer = null;
        expandingCleanupMarks.forEach((item) => {
            delete item.dataset.expanding;
            item.style.removeProperty("--mark-expand-x");
            item.style.removeProperty("--mark-expand-y");
            item.style.removeProperty("--mark-expand-scale");
        });
        expandingCleanupMarks.clear();
        scheduleMarkRenderRefresh();
    }, 540);
}

function markIsAnimating(mark) {
    return mark.dataset.expanding === "true"
        || mark.dataset.coalescing === "true"
        || mark.classList.contains("is-undoing");
}

function shouldSuppressClusteredMarkDom(mark, renderMode, selectedMark) {
    return marks.length > largeMarkDomThreshold
        && renderMode !== "detail"
        && mark !== selectedMark
        && !markIsAnimating(mark)
        && mark.classList.contains("is-clustered");
}

function largeClusteredMapHasNoVisibleMarkDom(selectedMark, renderMode) {
    return marks.length > largeMarkDomThreshold
        && renderMode !== "detail"
        && !selectedMark
        && clusteredMarkCount >= marks.length
        && coalescingCleanupTimer === null
        && expandingCleanupTimer === null
        && coalescingCleanupMarks.size === 0
        && expandingCleanupMarks.size === 0;
}

function renderMarksForViewport(renderMode = canvas?.dataset.renderMode || "detail") {
    if (!canvas || !canvasWorld) {
        return;
    }

    const bounds = bufferedWorldBounds(visibleWorldBounds(), markRenderBuffer);
    const selectedMark = selectedCanvasMark();
    const fragment = document.createDocumentFragment();
    const nextRenderedMarkUids = new Set();
    const viewportSignature = markViewportSignature(bounds, renderMode, selectedMark);

    if (largeClusteredMapHasNoVisibleMarkDom(selectedMark, renderMode)) {
        const mountedMarks = mountedMarkElements();
        if (renderedMarkUids.size === 0 && mountedMarks.length === 0 && canvas.dataset.renderedMarkCount === "0") {
            renderedMarkViewportSignature = viewportSignature;
            canvas.dataset.totalMarkCount = String(marks.length);
            return;
        }
        unmountMountedMarksForLargeMap(mountedMarks, selectedMark);
        renderedMarkUids.clear();
        renderedMarkViewportSignature = viewportSignature;
        updateRenderedMarkCountDataset();
        return;
    }

    if (viewportSignature === renderedMarkViewportSignature) {
        return;
    }
    renderedMarkViewportSignature = viewportSignature;

    const skipClustered = marks.length > largeMarkDomThreshold && renderMode !== "detail" && clusteredMarkUids.size > 0
        ? clusteredMarkUids
        : null;

    marksInBounds(bounds, skipClustered).forEach((mark) => {
        if (!shouldSuppressClusteredMarkDom(mark, renderMode, selectedMark)) {
            nextRenderedMarkUids.add(mark.dataset.uid);
        }
    });

    if (skipClustered) {
        coalescingCleanupMarks.forEach((mark) => {
            if (mark.dataset.uid) {
                nextRenderedMarkUids.add(mark.dataset.uid);
            }
        });
        expandingCleanupMarks.forEach((mark) => {
            if (mark.dataset.uid) {
                nextRenderedMarkUids.add(mark.dataset.uid);
            }
        });
    }

    if (selectedMark && !shouldSuppressClusteredMarkDom(selectedMark, renderMode, selectedMark)) {
        nextRenderedMarkUids.add(selectedMark.dataset.uid);
    }

    renderedMarkUids.forEach((uid) => {
        if (nextRenderedMarkUids.has(uid)) {
            return;
        }
        const mark = markByUid(uid);
        if (mark) {
            unmountMark(mark);
        }
    });

    nextRenderedMarkUids.forEach((uid) => {
        const mark = markByUid(uid);
        if (!mark) {
            return;
        }
        deferredMarkUnmountUids.delete(uid);
        positionMarkElement(mark);
        mountMark(mark, fragment);
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
    renderedMarkViewportSignature = "";
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
    _cachedCanvasRect = canvas.getBoundingClientRect();
    if (!options.deferClusterCommit) {
        commitClusterLevelForZoom(canvasView.zoom, { animate: options.animateClusterTransition !== false });
    }

    applyWorldGeometry();
    if (geometryDirty) {
        if (marks.length > largeMarkDomThreshold) {
            renderedMarkUids.forEach((uid) => {
                const mark = markByUid(uid);
                if (mark && !shouldSuppressClusteredMarkDom(mark, canvas?.dataset.renderMode || "detail", selectedCanvasMark())) {
                    positionMarkElement(mark);
                }
            });
            positionPlacementMarker();
        } else {
            positionAllMarks();
        }
        geometryDirty = false;
    }
    if (canvasWorld) {
        canvasWorld.style.transform = `translate(${canvasView.panX}px, ${canvasView.panY}px) scale(${canvasView.zoom})`;
    }
    setStylePropertyIfChanged(canvas, "--canvas-zoom", String(canvasView.zoom));
    canvas.classList.toggle("is-map-view", canvasView.zoom < mapModeZoom);
    const renderMode = canvasView.zoom < mapModeZoom
        ? "map"
        : visibleTileKeys().size > maxTileOverviewStopCount
            ? "overview"
            : "detail";
    canvas.dataset.renderMode = renderMode;
    renderFogCanvas(renderMode);
    renderMapClusters();
    if (renderMode !== "detail") {
        scheduleClusterLayerIntegrityCheck();
    }
    renderMarksForViewport(renderMode);
    if (marks.length > largeMarkDomThreshold && renderMode !== "detail") {
        startLargeMapMarkDomCleanup();
        scheduleLargeClusteredMapUnmountRefresh();
    }
    positionPlacementMarker();
    updateSelectedMarkPopout();
    updateZoomControls();
    _cachedCanvasRect = null;
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
        const text = formatZoomPercent(canvasView.zoom);
        if (text !== _lastZoomReadoutText) {
            _lastZoomReadoutText = text;
            zoomReadout.value = text;
            zoomReadout.textContent = text;
        }
    }

    if (zoomOutButton) {
        const disabled = roundedZoom <= Number(min.toFixed(3));
        if (disabled !== _lastZoomOutDisabled) {
            _lastZoomOutDisabled = disabled;
            zoomOutButton.disabled = disabled;
        }
    }

    if (zoomInButton) {
        const disabled = roundedZoom >= Number(max.toFixed(3));
        if (disabled !== _lastZoomInDisabled) {
            _lastZoomInDisabled = disabled;
            zoomInButton.disabled = disabled;
        }
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
    exploredTilesVersion += 1;
    addExploredTile("0,0");
    commitTilesForMarks(marks);
    updateWorldBounds();
    geometryDirty = true;
    clearRenderedTileCache();
    clearRenderedMarkCache();
    resetClusterDrilldown();
    clusterCache = [];
    invalidateClusterState();
    applyCanvasView();
}

function easeOutCubic(progress) {
    return 1 - Math.pow(1 - progress, 3);
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

    if (duration <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
    const zoom = clampZoom(Math.max(1, targetZoom));
    animateCanvasViewTo(centeredCanvasViewForCoordinate(x, y, zoom), options.duration ?? 520, { onComplete: options.onComplete });
    leaveFitWorldMode();
}

function focusedCanvasViewForMark(mark, targetZoom = 1.35) {
    if (!mark) {
        return null;
    }

    const x = Number.parseFloat(mark.dataset.x || "0");
    const y = Number.parseFloat(mark.dataset.y || "0");
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    return centeredCanvasViewForCoordinate(x, y, clampZoom(Math.max(1, targetZoom)));
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

    const rect = _cachedCanvasRect || canvas.getBoundingClientRect();
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
    const originTileCenter = tileCenterCoordinate(0, 0);
    canvasView = centeredCanvasViewForCoordinate(originTileCenter.x, originTileCenter.y, 1);
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
    const rect = _cachedCanvasRect || canvas.getBoundingClientRect();
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
    if (x < minCoordinate || x >= maxCoordinate || y < minCoordinate || y >= maxCoordinate) {
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

    if (x < minCoordinate || x >= maxCoordinate || y < minCoordinate || y >= maxCoordinate) {
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
        markPopout.dataset.state = "hidden";
        delete markPopout.dataset.locatorTarget;
    }
}

function selectMark(mark, options = {}) {
    marks.forEach((item) => item.removeAttribute("data-selected"));
    selectedMarkElement = mark;
    mountMark(mark);
    positionMarkElement(mark);
    mark.setAttribute("data-selected", "true");
    markPreview?.classList.remove("is-empty");

    previewChip.style.background = getComputedStyle(mark).getPropertyValue("--mark-color");
    previewChip.classList.toggle("square", mark.classList.contains("square"));
    previewChip.classList.toggle("diamond", mark.classList.contains("diamond"));
    previewName.textContent = mark.dataset.name;
    previewMessage.textContent = mark.dataset.message;
    renderDrawingPreview(mark.dataset.drawing || "");
    previewCreated.textContent = mark.dataset.created;
    if (markPopout) {
        markPopout.hidden = options.showPopout === false;
        positionMarkPopout();
    }
    ensureMarkDrawingLoaded(mark);
}

function setEmptyPreview() {
    marks.forEach((item) => item.removeAttribute("data-selected"));
    selectedMarkElement = null;
    markPreview?.classList.add("is-empty");
    hideMarkPopout();
    renderedClusterSignature = "";
    renderMapClusters();
    previewChip.style.background = "#f0b35a";
    previewName.textContent = "No mark selected";
    previewMessage.textContent = "Choose an existing mark to preview it here.";
    if (previewDrawing) {
        previewDrawing.innerHTML = "";
        previewDrawing.hidden = true;
    }
    previewCreated.textContent = "Waiting for the first mark.";
    previewChip.classList.remove("square", "diamond");
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
        {
            duration: options.duration,
            onComplete: options.onComplete || updateSelectedMarkPopout,
        },
    );
}

function markUid(mark) {
    return mark?.dataset?.uid || "";
}

function markByUid(uid) {
    return marksByUid.get(uid) || null;
}

function focusMarkByUid(uid, markView = null) {
    const mark = markByUid(uid) || (markView ? addOrUpdateMark(markView, false) : null);
    canvas?.scrollIntoView({ block: "center", behavior: "smooth" });
    focusRecentMarkThroughClusters(mark);
}

function clusterPathForMark(mark, hierarchy = null) {
    const uid = markUid(mark);
    if (!uid) {
        return [];
    }

    const clusterHierarchy = hierarchy || fullClusterHierarchy();
    return clusterLevels
        .map((level, levelIndex) => {
            const cluster = (clusterHierarchy[levelIndex] || []).find((item) => (
                item.level === level.key
                && item.count > 1
                && item.marks.some((clusterMark) => markUid(clusterMark) === uid)
            ));
            return cluster ? { level, levelIndex, cluster } : null;
        })
        .filter(Boolean);
}

function clusterPathForCluster(cluster, hierarchy) {
    if (!cluster || !hierarchy) {
        return [];
    }

    const targetLevelIndex = clusterLevelIndexForKey(cluster.level);
    if (targetLevelIndex === -1) {
        return [];
    }

    const clusterUids = new Set(cluster.marks.map(markUid).filter(Boolean));
    if (clusterUids.size === 0) {
        return [];
    }

    return clusterLevels
        .map((level, levelIndex) => {
            if (levelIndex > targetLevelIndex) {
                return null;
            }

            const levelClusters = hierarchy[levelIndex] || [];
            const pathCluster = levelIndex === targetLevelIndex
                ? levelClusters.find((item) => item.level === level.key && item.id === cluster.id)
                : levelClusters.find((item) => (
                    item.level === level.key
                    && item.count > 1
                    && [...clusterUids].every((uid) => item.marks.some((clusterMark) => markUid(clusterMark) === uid))
                ));

            return pathCluster ? { level, levelIndex, cluster: pathCluster } : null;
        })
        .filter(Boolean);
}

function clusterPathForCurrentViewport(hierarchy) {
    if (!canvas || !hierarchy) {
        return [];
    }

    const currentLevelIndex = clusterLevelIndex();
    if (currentLevelIndex >= clusterLevels.length) {
        return [];
    }

    const center = viewportCenterCoordinate();
    const bounds = viewportWorldBounds(0);
    const viewportClusters = [];

    for (let levelIndex = currentLevelIndex; levelIndex < clusterLevels.length; levelIndex += 1) {
        (hierarchy[levelIndex] || [])
            .filter((cluster) => cluster.count > 1)
            .forEach((cluster) => {
                const distance = Math.hypot(center.x - cluster.x, center.y - cluster.y);
                const centerVisible = !bounds
                    || (cluster.x >= bounds.minX && cluster.x <= bounds.maxX
                        && cluster.y >= bounds.minY && cluster.y <= bounds.maxY);
                const markVisible = bounds && cluster.marks.some((mark) => {
                    const x = Number.parseFloat(mark.dataset.x || "0");
                    const y = Number.parseFloat(mark.dataset.y || "0");
                    return Number.isFinite(x) && Number.isFinite(y)
                        && x >= bounds.minX && x <= bounds.maxX
                        && y >= bounds.minY && y <= bounds.maxY;
                });

                if (!centerVisible && !markVisible) {
                    return;
                }

                viewportClusters.push({
                    cluster,
                    levelIndex,
                    distance,
                    visibleWeight: centerVisible ? 0 : 1,
                });
            });

        if (viewportClusters.length > 0) {
            break;
        }
    }

    const currentCluster = viewportClusters.sort((a, b) => (
        a.visibleWeight - b.visibleWeight
        || a.distance - b.distance
        || b.levelIndex - a.levelIndex
        || a.cluster.id.localeCompare(b.cluster.id)
    ))[0]?.cluster;

    return clusterPathForCluster(currentCluster, hierarchy);
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

function markIsAlreadyFocused(mark, targetZoom = 1.35) {
    const focusedView = focusedCanvasViewForMark(mark, targetZoom);
    return selectedCanvasMark() === mark
        && markIsVisibleAtIndividualZoom(mark)
        && focusedView !== null
        && canvasViewsMatch(canvasView, focusedView);
}

function selectedReturnDetailZoom() {
    return clampZoom(Math.max(1.35, clusterZoomThresholds.neighbor + (zoomSnapTolerance * 2)));
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

function selectedReturnClusterStartIndex(path) {
    const currentLevelIndex = clusterLevelIndex();
    const zoomIndex = path.findIndex(({ levelIndex }) => levelIndex >= currentLevelIndex);

    if (zoomIndex !== -1) {
        return zoomIndex;
    }

    return Math.max(0, path.length - 1);
}

function selectedCanvasMark() {
    if (selectedMarkElement?.dataset?.selected === "true") {
        return selectedMarkElement;
    }

    selectedMarkElement = marks.find((item) => item.dataset.selected === "true") || null;
    return selectedMarkElement;
}

function deepestSharedCluster(currentPath, targetPath) {
    let shared = null;

    currentPath.forEach((currentEntry, currentPathIndex) => {
        const targetPathIndex = targetPath.findIndex((targetEntry) => (
            targetEntry.levelIndex === currentEntry.levelIndex
            && targetEntry.cluster.id === currentEntry.cluster.id
        ));
        if (targetPathIndex === -1) {
            return;
        }
        if (!shared || currentEntry.levelIndex > shared.levelIndex) {
            shared = {
                levelIndex: currentEntry.levelIndex,
                currentPathIndex,
                targetPathIndex,
            };
        }
    });

    return shared;
}

function sharedClusterTraversal(currentPath, targetPath) {
    const shared = deepestSharedCluster(currentPath, targetPath);
    if (!shared) {
        return null;
    }

    return [
        ...currentPath.slice(shared.currentPathIndex + 1).reverse().map((entry) => ({
            type: "overview",
            popupMode: "adaptive",
            entry,
        })),
        ...targetPath.slice(shared.targetPathIndex + 1).flatMap((entry) => [
            { type: "overview", popupMode: "hidden", entry },
            { type: "drilldown", popupMode: "hidden", entry },
        ]),
    ];
}

function animateClusterOverview(cluster, options = {}) {
    if (!canvas || !cluster) {
        return Promise.resolve(null);
    }

    const levelIndex = clusterLevelIndexForKey(cluster.level);
    const level = clusterLevels[levelIndex] || activeClusterLevel();
    const bounds = boundsForMarks(cluster.marks);
    if (!Number.isFinite(bounds.minX)) {
        return Promise.resolve(null);
    }

    const timing = options.timing || recentClusterOpenTiming;
    const cameraDuration = timing.camera ?? recentClusterOpenTiming.camera;
    const settleDuration = timing.settle ?? recentClusterOpenTiming.settle;
    const view = canvasViewForBounds(bounds, {
        padding: Math.max(level?.padding ?? 84, 128),
        minSpan: 1,
        minZoom: 0,
        maxZoom: clusterTargetZoomForLevel(levelIndex, canvasView.zoom),
    });

    leaveFitWorldMode();
    return new Promise((resolve) => {
        animateCanvasViewTo(view, cameraDuration, {
            easing: easeInOutCubic,
            onComplete: () => {
                window.setTimeout(() => resolve({ cluster, view }), settleDuration);
            },
        });
    });
}

function animateWorldOverview(options = {}) {
    const timing = options.timing || recentClusterOpenTiming;

    return new Promise((resolve) => {
        animateCanvasViewTo(worldOverviewView(), timing.world, {
            clamp: false,
            easing: easeInOutCubic,
            onComplete: resolve,
        });
    });
}

function animateMarkTraversalLevel(mark, levelIndex, options = {}) {
    if (!canvas || !mark) {
        return Promise.resolve(null);
    }

    const x = Number.parseFloat(mark.dataset.x || "0");
    const y = Number.parseFloat(mark.dataset.y || "0");
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return Promise.resolve(null);
    }

    const level = clusterLevels[levelIndex] || activeClusterLevel();
    const timing = options.timing || recentClusterOpenTiming;
    const cameraDuration = timing.camera ?? recentClusterOpenTiming.camera;
    const settleDuration = timing.settle ?? recentClusterOpenTiming.settle;
    const view = canvasViewForBounds({ minX: x, maxX: x, minY: y, maxY: y }, {
        padding: Math.max(level?.padding ?? 84, 128),
        minSpan: 1,
        minZoom: 0,
        maxZoom: clusterTargetZoomForLevel(levelIndex, canvasView.zoom),
    });

    leaveFitWorldMode();
    return new Promise((resolve) => {
        animateCanvasViewTo(view, cameraDuration, {
            easing: easeInOutCubic,
            onComplete: () => {
                window.setTimeout(() => resolve({ mark, levelIndex, view }), settleDuration);
            },
        });
    });
}

function recentTraversalStepsForPath(path, options = {}) {
    const byLevel = new Map(path.map((entry) => [entry.levelIndex, entry]));
    const startLevelIndex = options.startLevelIndex ?? 0;
    const includeOverview = options.includeOverview === true;
    const steps = [];

    for (let levelIndex = startLevelIndex; levelIndex < clusterLevels.length; levelIndex += 1) {
        const entry = byLevel.get(levelIndex);
        if (entry) {
            if (includeOverview) {
                steps.push({ type: "overview", popupMode: "hidden", entry });
            }
            steps.push({ type: "drilldown", popupMode: "hidden", entry });
        } else {
            steps.push({ type: "mark-level", popupMode: "hidden", levelIndex });
        }
    }

    return steps;
}

function recentSharedClusterTraversal(currentPath, targetPath) {
    const shared = deepestSharedCluster(currentPath, targetPath);
    if (!shared) {
        return null;
    }

    return [
        ...currentPath.slice(shared.currentPathIndex + 1).reverse().map((entry) => ({
            type: "overview",
            popupMode: "adaptive",
            entry,
        })),
        ...recentTraversalStepsForPath(targetPath, {
            startLevelIndex: shared.levelIndex + 1,
            includeOverview: true,
        }),
    ];
}

async function runRecentClusterSequence(steps, mark, token, options = {}) {
    recentFocusSequenceActive = true;
    for (const step of steps) {
        if (recentFocusToken !== token) {
            recentFocusSequenceActive = false;
            recentFocusPopupMode = null;
            updateSelectedMarkPopout();
            return;
        }

        recentFocusPopupMode = options.hidePopupDuringTraversal || step.popupMode === "hidden" ? "hidden" : null;
        updateSelectedMarkPopout();
        if (step.type === "overview") {
            await animateClusterOverview(step.entry.cluster, { timing: recentClusterOpenTiming });
        } else if (step.type === "mark-level") {
            await animateMarkTraversalLevel(mark, step.levelIndex, { timing: recentClusterOpenTiming });
        } else {
            await zoomIntoCluster(step.entry.cluster, { timing: recentClusterOpenTiming });
        }
    }

    if (recentFocusToken === token) {
        recentFocusSequenceActive = false;
        recentFocusPopupMode = null;
        focusMark(mark, options.finalZoom || 1.35, { duration: recentClusterOpenTiming.finalFocus });
        updateSelectedMarkPopout();
    }
}

function focusRecentMarkThroughClusters(mark, options = {}) {
    if (!mark || !canvas) {
        return;
    }

    const currentMark = selectedCanvasMark();
    if (currentMark === mark && markIsAlreadyFocused(mark, options.finalZoom || 1.35)) {
        recentFocusSequenceActive = false;
        recentFocusPopupMode = null;
        updateSelectedMarkPopout();
        return;
    }

    mountMark(mark);
    const token = recentFocusToken + 1;
    recentFocusToken = token;
    recentFocusPopupMode = options.hidePopupDuringTraversal ? "hidden" : null;
    updateSelectedMarkPopout();

    const hierarchy = fullClusterHierarchy();
    const path = clusterPathForMark(mark, hierarchy);

    if (currentMark && currentMark !== mark) {
        const currentPath = clusterPathForMark(currentMark, hierarchy);
        const sharedTraversal = recentSharedClusterTraversal(currentPath, path);
        if (sharedTraversal) {
            leaveFitWorldMode();
            runRecentClusterSequence(sharedTraversal, mark, token, options);
            return;
        }
    }

    const startIndex = recentClusterStartIndex(path);

    leaveFitWorldMode();
    if (startIndex === 0) {
        animateWorldOverview({ timing: recentClusterOpenTiming })
            .then(() => runRecentClusterSequence(
                recentTraversalStepsForPath(path),
                mark,
                token,
                options,
            ));
        return;
    }

    runRecentClusterSequence(
        recentTraversalStepsForPath(path, { startLevelIndex: path[startIndex]?.levelIndex ?? 0 }),
        mark,
        token,
        options,
    );
}

function focusSelectedMarkThroughClusters() {
    const mark = selectedCanvasMark();
    if (!mark || !canvas) {
        return;
    }

    mountMark(mark);
    const token = recentFocusToken + 1;
    recentFocusToken = token;
    recentFocusPopupMode = "hidden";
    updateSelectedMarkPopout();

    if (canvasView.zoom > clusterZoomThresholds.neighbor + zoomSnapTolerance) {
        recentFocusSequenceActive = false;
        recentFocusPopupMode = null;
        focusMark(mark, selectedReturnDetailZoom(), { duration: recentClusterOpenTiming.finalFocus });
        updateSelectedMarkPopout();
        return;
    }

    const hierarchy = fullClusterHierarchy();
    const targetPath = clusterPathForMark(mark, hierarchy);
    if (targetPath.length === 0) {
        recentFocusSequenceActive = false;
        recentFocusPopupMode = null;
        focusMark(mark, selectedReturnDetailZoom(), { duration: recentClusterOpenTiming.finalFocus });
        updateSelectedMarkPopout();
        return;
    }

    const viewportPath = clusterPathForCurrentViewport(hierarchy);
    const sharedTraversal = sharedClusterTraversal(viewportPath, targetPath);
    leaveFitWorldMode();

    if (sharedTraversal) {
        runRecentClusterSequence(sharedTraversal, mark, token, { hidePopupDuringTraversal: true, finalZoom: selectedReturnDetailZoom() });
        return;
    }

    const startIndex = selectedReturnClusterStartIndex(targetPath);
    runRecentClusterSequence(
        targetPath.slice(startIndex).flatMap((entry) => [
            { type: "overview", popupMode: "hidden", entry },
            { type: "drilldown", popupMode: "hidden", entry },
        ]),
        mark,
        token,
        { hidePopupDuringTraversal: true, finalZoom: selectedReturnDetailZoom() },
    );
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
    const hasDrawingPayload = Object.prototype.hasOwnProperty.call(mark, "drawing");

    return {
        uid: mark.uid,
        name: mark.display_name,
        message: mark.message || (hasDrawingPayload && mark.drawing ? "A quiet sketch without words." : "A quiet mark without words."),
        drawing: hasDrawingPayload ? (mark.drawing || "") : null,
        drawingLoaded: hasDrawingPayload,
        x: Number.parseFloat(mark.x_percent),
        y: Number.parseFloat(mark.y_percent),
        color: mark.color,
        shape: mark.shape,
        created: formatCreatedAt(mark.created_at),
    };
}

function createMarkElement(mark, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mark-dot ${mark.shape}`;
    button.style.setProperty("--mark-color", mark.color);
    button.dataset.uid = mark.uid;
    button.dataset.name = mark.name;
    button.dataset.message = mark.message;
    button.dataset.drawing = mark.drawing || "";
    button.dataset.drawingLoaded = mark.drawingLoaded ? "true" : "false";
    button.dataset.created = mark.created;
    button.dataset.x = String(mark.x);
    button.dataset.y = String(mark.y);
    if (!options.deferPosition) {
        positionMarkElement(button);
    }
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
    marksByUid.delete(mark.dataset.uid);
    markPositions.delete(mark.dataset.uid);
    markSpatialIndexDirty = true;
    renderedMarkUids.delete(mark.dataset.uid);
    mark.remove();
    markCollectionChanged();
    if (wasSelected) {
        selectedMarkElement = null;
    }
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
    const existing = marksByUid.get(mark.uid);
    if (existing) {
        existing.className = `mark-dot ${mark.shape}`;
        existing.dataset.name = mark.name;
        existing.dataset.message = mark.message;
        if (mark.drawing !== null) {
            existing.dataset.drawing = mark.drawing;
            existing.dataset.drawingLoaded = "true";
        } else if (!existing.dataset.drawingLoaded) {
            existing.dataset.drawingLoaded = "false";
        }
        existing.dataset.created = mark.created;
        existing.dataset.x = String(mark.x);
        existing.dataset.y = String(mark.y);
        existing.style.setProperty("--mark-color", mark.color);
        cacheMarkPosition(existing);
        if (!options.deferPosition) {
            positionMarkElement(existing);
        }
        if (!options.deferCollectionChanged) {
            markCollectionChanged();
        }
        if (!options.deferLayout) {
            expandWorldForMarks();
        }
        if (select) {
            selectMark(existing);
        }
        return existing;
    }

    const element = createMarkElement(mark, { deferPosition: options.deferPosition });
    marks.push(element);
    marksByUid.set(element.dataset.uid, element);
    cacheMarkPosition(element);
    if (!options.deferCollectionChanged) {
        markCollectionChanged();
    }
    const tileX = Math.floor(Number.parseFloat(mark.x ?? "0") / tileSize);
    const tileY = Math.floor(Number.parseFloat(mark.y ?? "0") / tileSize);
    revealTileAndNeighbors(tileX, tileY);
    if (!options.deferLayout) {
        expandWorldForMarks();
    }
    if (select) {
        animateNewMark(element);
    }
    if (select) {
        mountMark(element);
        selectMark(element);
    } else if (!options.deferLayout) {
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

async function ensureMarkDrawingLoaded(mark) {
    if (!mark || mark.dataset.drawingLoaded === "true") {
        return;
    }

    const uid = mark.dataset.uid || "";
    if (uid === "") {
        return;
    }

    if (markDrawingRequests.has(uid)) {
        await markDrawingRequests.get(uid);
        return;
    }

    const request = fetch(`/api/marks.php?uid=${encodeURIComponent(uid)}`, {
        headers: { Accept: "application/json" },
    })
        .then(async (response) => {
            if (!response.ok) {
                return;
            }

            const payload = await response.json();
            if (!payload.ok || !payload.mark) {
                return;
            }

            mark.dataset.drawing = payload.mark.drawing || "";
            mark.dataset.drawingLoaded = "true";
            if (mark.dataset.selected === "true") {
                renderDrawingPreview(mark.dataset.drawing);
                positionMarkPopout();
            }
        })
        .catch(() => {
            mark.dataset.drawingLoaded = "false";
        })
        .finally(() => {
            markDrawingRequests.delete(uid);
        });

    markDrawingRequests.set(uid, request);
    await request;
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

        if (selectedMarkElement === mark) {
            selectedMarkElement = null;
        }
        mark.remove();
        marksByUid.delete(mark.dataset.uid);
        markPositions.delete(mark.dataset.uid);
        markSpatialIndexDirty = true;
        renderedMarkUids.delete(mark.dataset.uid);
        return false;
    });

    if (marks.length !== originalCount) {
        if (!options.deferCollectionChanged) {
            markCollectionChanged();
        }
        if (!options.deferLayout) {
            rebuildWorldForCurrentMarks();
        }
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
        const activateRecentMark = (event) => {
            event.preventDefault();
            event.stopPropagation();
            focusMarkByUid(mark.uid, mark);
        };
        button.addEventListener("click", activateRecentMark);
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
    clusterDataVersion += 1;
    invalidateClusterHierarchy();
    invalidateClusterState();
    markItems.forEach((mark) => addOrUpdateMark(mark, false, { deferLayout: true, deferCollectionChanged: true, deferPosition: true }));
    removeMissingMarks(payload.mark_uids, { deferLayout: true, deferCollectionChanged: true });
    markCollectionChanged();
    rebuildMarksByUid();
    rebuildMarkPositionCache();
    rebuildMarkSpatialIndex();
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
rebuildMarkSpatialIndex();
const initialSelectedMark = marks.find((mark) => mark.dataset.selected === "true");
if (initialSelectedMark) {
    selectMark(initialSelectedMark, { showPopout: false });
} else {
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

        if (event.button !== 0
            || event.target.closest(".mark-dot")
            || event.target.closest(".map-cluster")
            || event.target.closest("[data-mark-popout]")
            || event.target.closest(".canvas-hint")) {
            return;
        }

        if (event.shiftKey || keyboardPanActive) {
            return;
        }

        setEmptyPreview();

        const { x, y } = canvasPointFromEvent(event);

        setActiveTool(placeButton);
        setPlacement(x, y);
    });

    if (randomButton) {
        randomButton.addEventListener("click", () => {
            setActiveTool(randomButton);

            for (let attempt = 0; attempt < 80; attempt += 1) {
                const { x, y } = randomCoordinateInExploredTiles();

                if (!tooCloseToExistingMarks(x, y) && !matchesCurrentPlacement(x, y)) {
                    setPlacement(x, y);
                    focusCanvasOnCoordinate(x, y, 1.35);
                    placementNote.textContent = `Random spot: ${xField.value}px, ${yField.value}px`;
                    return;
                }
            }

            const fallback = firstAvailableCoordinateInExploredTiles();
            if (fallback) {
                setPlacement(fallback.x, fallback.y);
                focusCanvasOnCoordinate(fallback.x, fallback.y, 1.35);
                placementNote.textContent = `Random spot: ${xField.value}px, ${yField.value}px`;
                return;
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
            const button = closestElement(event.target, "[data-recent-uid]");
            if (!button) {
                return;
            }

            focusMarkByUid(button.dataset.recentUid);
        });
    }

    if (focusLatestButton) {
        focusLatestButton.addEventListener("click", () => {
            const latestUid = recentList?.querySelector("[data-recent-uid]")?.dataset.recentUid;
            if (latestUid) {
                focusMarkByUid(latestUid);
                return;
            }
            focusRecentMarkThroughClusters(marks[marks.length - 1]);
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

        const targetMark = markByUid(targetUid);
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

if (markPopout) {
    markPopout.addEventListener("click", (event) => {
        if (markPopout.dataset.state !== "compact") {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        focusSelectedMarkThroughClusters();
    });
}

document.addEventListener("click", (event) => {
    if (suppressNextDocumentClick) {
        suppressNextDocumentClick = false;
        return;
    }

    if (closestElement(event.target, "[data-mark-popout]")
        || closestElement(event.target, ".mark-dot")
        || closestElement(event.target, ".map-cluster")
        || closestElement(event.target, ".canvas-hint")
        || closestElement(event.target, "[data-recent-uid]")) {
        return;
    }

    if (event.shiftKey || keyboardPanActive) {
        return;
    }

    if (selectedCanvasMark() && closestElement(event.target, "[data-mark-canvas]")) {
        setEmptyPreview();
        return;
    }

    if (!markPopout || markPopout.hidden) {
        return;
    }

    hideMarkPopout();
});

startLiveUpdates();
