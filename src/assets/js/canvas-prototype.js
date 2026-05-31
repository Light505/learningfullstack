let marks = Array.from(document.querySelectorAll(".mark-dot"));
const previewChip = document.querySelector(".preview-chip");
const previewName = document.querySelector("[data-preview-name]");
const previewMessage = document.querySelector("[data-preview-message]");
const previewDrawing = document.querySelector("[data-preview-drawing]");
const previewCreated = document.querySelector("[data-preview-created]");
const canvas = document.querySelector("[data-mark-canvas]");
const canvasHint = document.querySelector("[data-canvas-hint]");
const hideCanvasHint = document.querySelector("[data-hide-canvas-hint]");
const canvasWorld = document.querySelector("[data-canvas-world]");
const canvasTiles = document.querySelector("[data-canvas-tiles]");
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
const placementNote = document.querySelector("[data-placement-note]");
const formStatus = document.querySelector("[data-form-status]");
const placeButton = document.querySelector("[data-place-button]");
const randomButton = document.querySelector("[data-random-button]");
const zoomInButton = document.querySelector("[data-zoom-in-button]");
const zoomOutButton = document.querySelector("[data-zoom-out-button]");
const resetViewButton = document.querySelector("[data-reset-view-button]");
const fitWorldButton = document.querySelector("[data-fit-world-button]");
const exportWorldButton = document.querySelector("[data-export-world-button]");
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
let panStart = null;
let keyboardPanActive = false;
let suppressNextCanvasClick = false;
const tileSize = 1024;
const eraserRadius = 4.5;
const committedTiles = new Set(["0,0"]);
let worldBounds = { minX: 0, maxX: tileSize, minY: 0, maxY: tileSize };
let viewAnimation = null;
let geometryDirty = true;
let renderedTileSignature = "";
const markPositions = new Map();
const markPreview = document.querySelector(".mark-preview");

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

function updateWorldBounds() {
    const previousBounds = { ...worldBounds };
    const tiles = Array.from(visibleTileKeys()).map((key) => {
        const [tileX, tileY] = key.split(",").map(Number);
        return { tileX, tileY };
    });

    worldBounds = {
        minX: Math.min(...tiles.map((tile) => tile.tileX)) * tileSize,
        maxX: (Math.max(...tiles.map((tile) => tile.tileX)) + 1) * tileSize,
        minY: Math.min(...tiles.map((tile) => tile.tileY)) * tileSize,
        maxY: (Math.max(...tiles.map((tile) => tile.tileY)) + 1) * tileSize,
    };

    const boundsChanged = previousBounds.minX !== worldBounds.minX
        || previousBounds.maxX !== worldBounds.maxX
        || previousBounds.minY !== worldBounds.minY
        || previousBounds.maxY !== worldBounds.maxY;

    if (boundsChanged) {
        canvasView.panX += (worldBounds.minX - previousBounds.minX) * canvasView.zoom;
        canvasView.panY += (worldBounds.minY - previousBounds.minY) * canvasView.zoom;
        geometryDirty = true;
    }
}

function commitTile(tileX, tileY) {
    committedTiles.add(`${tileX},${tileY}`);
}

function commitTileBandForCoordinate(x, y) {
    const tileX = Math.floor(x / tileSize);
    const tileY = Math.floor(y / tileSize);

    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            commitTile(tileX + offsetX, tileY + offsetY);
        }
    }
}

function visibleTileKeys() {
    const tiles = new Set();

    committedTiles.forEach((key) => {
        const [tileX, tileY] = key.split(",").map(Number);

        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                tiles.add(`${tileX + offsetX},${tileY + offsetY}`);
            }
        }
    });

    return tiles;
}

function tileKeyForCoordinate(x, y) {
    return `${Math.floor(x / tileSize)},${Math.floor(y / tileSize)}`;
}

function isCommittedCoordinate(x, y) {
    return committedTiles.has(tileKeyForCoordinate(x, y));
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
    return committedTiles.has(`${tileX},${tileY}`) && isTileInsideCoordinateBounds(tileX, tileY);
}

function randomCoordinateInCommittedTiles() {
    const tileKeys = Array.from(committedTiles).filter((key) => {
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

    const tileSignature = [
        Array.from(committedTiles).sort().join("|"),
        Array.from(visibleTileKeys()).sort().join("|"),
    ].join("::");
    if (tileSignature === renderedTileSignature) {
        return;
    }

    renderedTileSignature = tileSignature;
    canvasTiles.innerHTML = "";
    const minTileX = worldBounds.minX / tileSize;
    const maxTileX = (worldBounds.maxX / tileSize) - 1;
    const minTileY = worldBounds.minY / tileSize;
    const maxTileY = (worldBounds.maxY / tileSize) - 1;

    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
        for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
            const key = `${tileX},${tileY}`;
            const tile = document.createElement("span");
            tile.className = isPlaceableTile(tileX, tileY)
                ? "canvas-tile is-committed"
                : "canvas-tile is-unavailable";
            tile.style.setProperty("--tile-left", `${tileX * tileSize - worldBounds.minX}px`);
            tile.style.setProperty("--tile-top", `${tileY * tileSize - worldBounds.minY}px`);
            tile.style.setProperty("--tile-width", `${tileSize}px`);
            tile.style.setProperty("--tile-height", `${tileSize}px`);
            tile.style.setProperty("--tile-bg-x", `${-(tileX * tileSize)}px`);
            tile.style.setProperty("--tile-bg-y", `${-(tileY * tileSize)}px`);
            tile.style.setProperty("--tile-shade", `${Math.abs((tileX * 17) + (tileY * 31)) % 7}`);
            canvasTiles.appendChild(tile);
        }
    }
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

function applyCanvasView(options = {}) {
    const shouldClamp = options.clamp !== false;
    if (shouldClamp) {
        clampCanvasView();
    }
    if (!canvas) {
        return;
    }

    applyWorldGeometry();
    if (geometryDirty) {
        positionAllMarks();
        geometryDirty = false;
    }
    positionPlacementMarker();
    canvas.style.setProperty("--canvas-pan-x", `${canvasView.panX}px`);
    canvas.style.setProperty("--canvas-pan-y", `${canvasView.panY}px`);
    canvas.style.setProperty("--canvas-zoom", String(canvasView.zoom));
    canvas.classList.toggle("is-map-view", canvasView.zoom < 0.32);
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
    committedTiles.clear();
    commitTile(0, 0);
    commitTilesForMarks(marks);
    updateWorldBounds();
    geometryDirty = true;
    applyCanvasView();
}

function easeOutCubic(progress) {
    return 1 - Math.pow(1 - progress, 3);
}

function cancelCanvasViewAnimation() {
    if (!viewAnimation) {
        return;
    }

    window.cancelAnimationFrame(viewAnimation);
    viewAnimation = null;
}

function animateCanvasViewTo(nextView, duration = 520, options = {}) {
    if (!canvas) {
        return;
    }

    cancelCanvasViewAnimation();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        canvasView = nextView;
        applyCanvasView(options);
        return;
    }

    const startView = { ...canvasView };
    const startedAt = performance.now();

    const step = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = easeOutCubic(progress);

        canvasView = {
            zoom: startView.zoom + ((nextView.zoom - startView.zoom) * eased),
            panX: startView.panX + ((nextView.panX - startView.panX) * eased),
            panY: startView.panY + ((nextView.panY - startView.panY) * eased),
        };
        applyCanvasView(options);

        if (progress < 1) {
            viewAnimation = window.requestAnimationFrame(step);
        } else {
            viewAnimation = null;
            canvasView = nextView;
            applyCanvasView(options);
        }
    };

    viewAnimation = window.requestAnimationFrame(step);
}

function settleCanvasView() {
    const nextView = clampedCanvasView(canvasView);

    if (nextView.panX === canvasView.panX && nextView.panY === canvasView.panY) {
        return;
    }

    animateCanvasViewTo(nextView, 360, { clamp: false });
}

function focusCanvasOnCoordinate(x, y, targetZoom = 1.35) {
    if (!canvas) {
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const zoom = Math.max(1, Math.min(2.4, targetZoom));

    animateCanvasViewTo({
        zoom,
        panX: (rect.width / 2) - ((x - worldBounds.minX) * zoom),
        panY: (rect.height / 2) - ((y - worldBounds.minY) * zoom),
    });
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

    const rect = canvas.getBoundingClientRect();
    const worldWidth = worldBounds.maxX - worldBounds.minX;
    const worldHeight = worldBounds.maxY - worldBounds.minY;
    const zoom = fitWorldZoom();

    animateCanvasViewTo({
        zoom,
        panX: (rect.width - (worldWidth * zoom)) / 2,
        panY: (rect.height - (worldHeight * zoom)) / 2,
    }, 520, { clamp: false });
}

function zoomCanvas(delta) {
    if (!canvas) {
        return;
    }

    cancelCanvasViewAnimation();
    const rect = canvas.getBoundingClientRect();
    const oldZoom = canvasView.zoom;
    const nextZoom = Math.max(fitWorldZoom(), Math.min(2.4, Number((oldZoom + delta).toFixed(2))));
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (centerX - canvasView.panX) / oldZoom;
    const worldY = (centerY - canvasView.panY) / oldZoom;

    canvasView.zoom = nextZoom;
    canvasView.panX = centerX - (worldX * nextZoom);
    canvasView.panY = centerY - (worldY * nextZoom);
    applyCanvasView();
}

function resetCanvasView() {
    if (!canvas) {
        return;
    }

    cancelCanvasViewAnimation();
    canvasView = {
        zoom: 1,
        panX: worldBounds.minX,
        panY: worldBounds.minY,
    };
    applyCanvasView();
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

    if (!isCommittedCoordinate(x, y)) {
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

    if (!isCommittedCoordinate(selectedX, selectedY)) {
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

function selectMark(mark) {
    marks.forEach((item) => item.removeAttribute("data-selected"));
    mark.setAttribute("data-selected", "true");
    markPreview?.classList.remove("is-empty");

    previewChip.style.background = getComputedStyle(mark).getPropertyValue("--mark-color");
    previewName.textContent = mark.dataset.name;
    previewMessage.textContent = mark.dataset.message;
    renderDrawingPreview(mark.dataset.drawing || "");
    previewCreated.textContent = mark.dataset.created;
}

function setEmptyPreview() {
    marks.forEach((item) => item.removeAttribute("data-selected"));
    markPreview?.classList.add("is-empty");
    previewChip.style.background = "#f0b35a";
    previewName.textContent = "No mark selected";
    previewMessage.textContent = "Choose an existing mark to preview it here.";
    if (previewDrawing) {
        previewDrawing.innerHTML = "";
        previewDrawing.hidden = true;
    }
    previewCreated.textContent = "Waiting for the first mark.";
}

function focusMark(mark, targetZoom = 1.35) {
    if (!mark) {
        return;
    }

    selectMark(mark);
    focusCanvasOnCoordinate(
        Number.parseFloat(mark.dataset.x || "0"),
        Number.parseFloat(mark.dataset.y || "0"),
        targetZoom,
    );
}

function bindMark(mark) {
    mark.addEventListener("click", () => selectMark(mark));
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
    canvasWorld.appendChild(element);
    marks.push(element);
    cacheMarkPosition(element);
    if (!options.deferLayout) {
        expandWorldForMarks();
    }
    if (select) {
        animateNewMark(element);
    }
    if (select) {
        selectMark(element);
    }
    return element;
}

function updateShapePreviewColor() {
    if (!form) {
        return;
    }

    const selectedColor = colorInputs.find((input) => input.checked)?.value || "#d9826b";
    form.style.setProperty("--selected-mark-color", selectedColor);
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
        dot.className = "recent-dot";
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
    dot.className = "recent-dot";
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
    selectMark(selectedMark);
} else if (marks.length === 0) {
    setEmptyPreview();
}

updateShapePreviewColor();
colorInputs.forEach((input) => {
    input.addEventListener("change", updateShapePreviewColor);
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

if (hideCanvasHint && canvasHint) {
    hideCanvasHint.addEventListener("click", () => {
        canvasHint.hidden = true;
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
        zoomInButton.addEventListener("click", () => zoomCanvas(0.2));
    }

    if (zoomOutButton) {
        zoomOutButton.addEventListener("click", () => zoomCanvas(-0.2));
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
        }

        const { minPanX, maxPanX, minPanY, maxPanY } = canvasPanBounds();
        canvasView.panX = rubberbandPan(panStart.panX + deltaX, minPanX, maxPanX);
        canvasView.panY = rubberbandPan(panStart.panY + deltaY, minPanY, maxPanY);
        applyCanvasView({ clamp: false });
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
        canvas.addEventListener(eventName, (event) => {
            if (panStart && panStart.pointerId === event.pointerId) {
                panStart = null;
                canvas.classList.remove("is-panning");
                settleCanvasView();
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
                const { x, y } = randomCoordinateInCommittedTiles();

                if (!tooCloseToExistingMarks(x, y)) {
                    setPlacement(x, y);
                    placementNote.textContent = `Random spot: ${xField.value}px, ${yField.value}px`;
                    return;
                }
            }

            placementNote.classList.add("error");
            placementNote.textContent = "The wall is crowded here. Try choosing a spot manually.";
        });
    }

    if (recentList) {
        recentList.addEventListener("click", (event) => {
            const button = event.target.closest("[data-recent-uid]");
            if (!button) {
                return;
            }

            const mark = marks.find((item) => item.dataset.uid === button.dataset.recentUid);
            focusMark(mark);
        });
    }

    if (focusLatestButton) {
        focusLatestButton.addEventListener("click", () => {
            const latestUid = recentList?.querySelector("[data-recent-uid]")?.dataset.recentUid;
            const mark = latestUid
                ? marks.find((item) => item.dataset.uid === latestUid)
                : marks[marks.length - 1];
            focusMark(mark, 1.45);
        });
    }

    window.addEventListener("resize", resetCanvasView);
    window.addEventListener("keydown", (event) => {
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
    window.addEventListener("blur", () => {
        keyboardPanActive = false;
        panStart = null;
        canvas.classList.remove("is-panning");
        settleCanvasView();
        updatePanIntent();
    });
    resetCanvasView();
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
                undoButton.disabled = false;
            }
            form.reset();
            clearDrawing();
            updateShapePreviewColor();
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
        undoButton.disabled = true;
        formStatus.classList.remove("error");
        formStatus.textContent = "Undoing your latest mark...";

        const body = new FormData();
        body.append("action", "undo");
        body.append("csrf_token", undoButton.dataset.csrfToken || "");

        try {
            const response = await fetch("/api/marks.php", {
                method: "POST",
                body,
            });
            const payload = await response.json();

            if (!response.ok || !payload.ok) {
                throw new Error(payload.error || "Unable to undo your latest mark.");
            }

            formStatus.textContent = "Latest mark removed.";
            window.location.reload();
        } catch (error) {
            formStatus.classList.add("error");
            formStatus.textContent = error.message;
            undoButton.disabled = false;
        }
    });
}

startLiveUpdates();
