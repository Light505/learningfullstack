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
const colorInputs = Array.from(document.querySelectorAll('input[name="color"]'));
const placementNote = document.querySelector("[data-placement-note]");
const formStatus = document.querySelector("[data-form-status]");
const placeButton = document.querySelector("[data-place-button]");
const randomButton = document.querySelector("[data-random-button]");
const zoomInButton = document.querySelector("[data-zoom-in-button]");
const zoomOutButton = document.querySelector("[data-zoom-out-button]");
const resetViewButton = document.querySelector("[data-reset-view-button]");
const undoButton = document.querySelector("[data-undo-button]");
const placementMarker = document.querySelector("[data-placement-marker]");
const submitButton = document.querySelector("[data-submit-button]");
const entryCount = document.querySelector("[data-entry-count]");
const entryCountLabel = document.querySelector("[data-entry-count-label]");
const recentTotal = document.querySelector("[data-recent-total]");
const recentList = document.querySelector("[data-recent-list]");
const toastRegion = document.querySelector("[data-toast-region]");
const minDistance = Number.parseFloat(canvas?.dataset.minDistance || "0");
const minCoordinate = Number.parseFloat(canvas?.dataset.minCoordinate || "-300");
const maxCoordinate = Number.parseFloat(canvas?.dataset.maxCoordinate || "300");
let drawingStrokes = [];
let activeStroke = null;
let liveSyncReady = false;
let activeTool = "place";
let canvasView = { zoom: 1, panX: 0, panY: 0 };
let panStart = null;
let keyboardPanActive = false;
let suppressNextCanvasClick = false;
const tileSize = 100;
const committedTiles = new Set(["0,0"]);
let worldBounds = { minX: 0, maxX: tileSize, minY: 0, maxY: tileSize };
let viewAnimation = null;
let geometryDirty = true;
let renderedTileSignature = "";
const markPositions = new Map();

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

    const rect = canvas.getBoundingClientRect();
    const worldWidth = rect.width * (worldBounds.maxX - worldBounds.minX) / tileSize;
    const worldHeight = rect.height * (worldBounds.maxY - worldBounds.minY) / tileSize;
    const minPanX = Math.min(0, rect.width - (worldWidth * canvasView.zoom));
    const minPanY = Math.min(0, rect.height - (worldHeight * canvasView.zoom));
    const maxPanX = Math.max(0, -worldBounds.minX / tileSize * rect.width * canvasView.zoom);
    const maxPanY = Math.max(0, -worldBounds.minY / tileSize * rect.height * canvasView.zoom);

    canvasView.panX = Math.max(minPanX, Math.min(maxPanX, canvasView.panX));
    canvasView.panY = Math.max(minPanY, Math.min(maxPanY, canvasView.panY));
}

function updateWorldBounds() {
    const previousBounds = { ...worldBounds };
    const tiles = Array.from(committedTiles).map((key) => {
        const [tileX, tileY] = key.split(",").map(Number);
        return { tileX, tileY };
    });

    worldBounds = {
        minX: Math.min(...tiles.map((tile) => tile.tileX)) * tileSize,
        maxX: (Math.max(...tiles.map((tile) => tile.tileX)) + 1) * tileSize,
        minY: Math.min(...tiles.map((tile) => tile.tileY)) * tileSize,
        maxY: (Math.max(...tiles.map((tile) => tile.tileY)) + 1) * tileSize,
    };

    if (previousBounds.minX !== worldBounds.minX
        || previousBounds.maxX !== worldBounds.maxX
        || previousBounds.minY !== worldBounds.minY
        || previousBounds.maxY !== worldBounds.maxY) {
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

function tileKeyForCoordinate(x, y) {
    return `${Math.floor(x / tileSize)},${Math.floor(y / tileSize)}`;
}

function isCommittedCoordinate(x, y) {
    return committedTiles.has(tileKeyForCoordinate(x, y));
}

function randomCoordinateInCommittedTiles() {
    const tileKeys = Array.from(committedTiles);
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

    const tileSignature = Array.from(committedTiles).sort().join("|");
    if (tileSignature === renderedTileSignature) {
        return;
    }

    renderedTileSignature = tileSignature;
    canvasTiles.innerHTML = "";
    const width = worldBounds.maxX - worldBounds.minX;
    const height = worldBounds.maxY - worldBounds.minY;

    Array.from(committedTiles).forEach((key) => {
        const [tileX, tileY] = key.split(",").map(Number);
        const tile = document.createElement("span");
        tile.className = "canvas-tile";
        tile.style.setProperty("--tile-left", `${((tileX * tileSize - worldBounds.minX) / width) * 100}%`);
        tile.style.setProperty("--tile-top", `${((tileY * tileSize - worldBounds.minY) / height) * 100}%`);
        tile.style.setProperty("--tile-width", `${(tileSize / width) * 100}%`);
        tile.style.setProperty("--tile-height", `${(tileSize / height) * 100}%`);
        tile.style.setProperty("--tile-shade", `${Math.abs((tileX * 17) + (tileY * 31)) % 7}`);
        canvasTiles.appendChild(tile);
    });
}

function applyWorldGeometry() {
    if (!canvas) {
        return;
    }

    canvas.style.setProperty("--canvas-world-width", `${worldBounds.maxX - worldBounds.minX}%`);
    canvas.style.setProperty("--canvas-world-height", `${worldBounds.maxY - worldBounds.minY}%`);
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
        const screenX = canvasView.panX + (((x - worldBounds.minX) / tileSize) * rect.width * canvasView.zoom);
        const screenY = canvasView.panY + (((y - worldBounds.minY) / tileSize) * rect.height * canvasView.zoom);

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

function applyCanvasView() {
    clampCanvasView();
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

function animateCanvasViewTo(nextView, duration = 520) {
    if (!canvas) {
        return;
    }

    if (viewAnimation) {
        window.cancelAnimationFrame(viewAnimation);
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        canvasView = nextView;
        applyCanvasView();
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
        applyCanvasView();

        if (progress < 1) {
            viewAnimation = window.requestAnimationFrame(step);
        } else {
            viewAnimation = null;
            canvasView = nextView;
            applyCanvasView();
        }
    };

    viewAnimation = window.requestAnimationFrame(step);
}

function focusCanvasOnCoordinate(x, y, targetZoom = 1.35) {
    if (!canvas) {
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const zoom = Math.max(1, Math.min(2.4, targetZoom));

    animateCanvasViewTo({
        zoom,
        panX: (rect.width / 2) - (((x - worldBounds.minX) / tileSize) * rect.width * zoom),
        panY: (rect.height / 2) - (((y - worldBounds.minY) / tileSize) * rect.height * zoom),
    });
}

function zoomCanvas(delta) {
    if (!canvas) {
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const oldZoom = canvasView.zoom;
    const nextZoom = Math.max(1, Math.min(2.4, Number((oldZoom + delta).toFixed(2))));
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

    const rect = canvas.getBoundingClientRect();
    canvasView = {
        zoom: 1,
        panX: (worldBounds.minX / tileSize) * rect.width,
        panY: (worldBounds.minY / tileSize) * rect.height,
    };
    applyCanvasView();
}

function canvasPointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: worldBounds.minX + ((((event.clientX - rect.left - canvasView.panX) / canvasView.zoom) / rect.width) * tileSize),
        y: worldBounds.minY + ((((event.clientY - rect.top - canvasView.panY) / canvasView.zoom) / rect.height) * tileSize),
    };
}

function visibleWorldBounds() {
    const rect = canvas.getBoundingClientRect();
    return {
        minX: Math.max(minCoordinate, worldBounds.minX + (((0 - canvasView.panX) / canvasView.zoom / rect.width) * tileSize)),
        maxX: Math.min(maxCoordinate, worldBounds.minX + (((rect.width - canvasView.panX) / canvasView.zoom / rect.width) * tileSize)),
        minY: Math.max(minCoordinate, worldBounds.minY + (((0 - canvasView.panY) / canvasView.zoom / rect.height) * tileSize)),
        maxY: Math.min(maxCoordinate, worldBounds.minY + (((rect.height - canvasView.panY) / canvasView.zoom / rect.height) * tileSize)),
    };
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
    placementNote.textContent = `Selected spot: ${xField.value}%, ${yField.value}%`;
    return true;
}

function selectMark(mark) {
    marks.forEach((item) => item.removeAttribute("data-selected"));
    mark.setAttribute("data-selected", "true");

    previewChip.style.background = getComputedStyle(mark).getPropertyValue("--mark-color");
    previewName.textContent = mark.dataset.name;
    previewMessage.textContent = mark.dataset.message;
    renderDrawingPreview(mark.dataset.drawing || "");
    previewCreated.textContent = mark.dataset.created;
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
            .map((stroke) => stroke.map((point) => ({
                x: Number(point.x),
                y: Number(point.y),
            })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
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
}

function renderRecent(markItems) {
    if (!recentList) {
        return;
    }

    recentList.innerHTML = "";
    markItems.forEach((mark) => {
        const item = document.createElement("li");
        const dot = document.createElement("span");
        const body = document.createElement("div");
        const name = document.createElement("strong");
        const message = document.createElement("p");
        const created = document.createElement("small");

        dot.className = "recent-dot";
        dot.style.setProperty("--mark-color", mark.color);
        name.textContent = mark.name;
        message.textContent = mark.message;
        created.textContent = mark.created;

        body.append(name, message, created);
        item.append(dot, body);
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
        .map((stroke) => stroke.slice(0, 500).map((point) => ({
            x: Number(point.x.toFixed(2)),
            y: Number(point.y.toFixed(2)),
        })))
        .filter((stroke) => stroke.length > 0)
        .slice(0, 20);

    drawingField.value = cleanStrokes.length > 0
        ? JSON.stringify({ v: 1, strokes: cleanStrokes })
        : "";
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

function clearDrawing() {
    drawingStrokes = [];
    activeStroke = null;
    updateDrawingField();
    renderDrawingCanvas();
}

function syncMarks(payload) {
    const recentMarks = payload.marks.map(apiMarkToView);
    const existingUids = new Set(marks.map((mark) => mark.dataset.uid));
    recentMarks.forEach((mark) => addOrUpdateMark(mark, false, { deferLayout: true }));
    removeMissingMarks(payload.mark_uids, { deferLayout: true });
    rebuildMarkPositionCache();
    rebuildWorldForCurrentMarks();
    renderRecent(recentMarks);
    updateCounts(payload.count);

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
}

updateShapePreviewColor();
colorInputs.forEach((input) => {
    input.addEventListener("change", updateShapePreviewColor);
});
expandWorldForMarks();

if (drawingCanvas) {
    drawingCanvas.addEventListener("pointerdown", (event) => {
        if (drawingStrokes.length >= 20) {
            return;
        }

        drawingCanvas.setPointerCapture(event.pointerId);
        activeStroke = [drawingPointFromEvent(event)];
        drawingStrokes.push(activeStroke);
        updateDrawingField();
        renderDrawingCanvas();
    });

    drawingCanvas.addEventListener("pointermove", (event) => {
        if (!activeStroke || activeStroke.length >= 500) {
            return;
        }

        activeStroke.push(drawingPointFromEvent(event));
        updateDrawingField();
        renderDrawingCanvas();
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
        drawingCanvas.addEventListener(eventName, () => {
            activeStroke = null;
            updateDrawingField();
        });
    });
}

if (drawingClear) {
    drawingClear.addEventListener("click", clearDrawing);
}

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

    canvas.addEventListener("pointerdown", (event) => {
        if (!isPanGesture(event) || event.target.closest(".canvas-hint") || event.target.closest(".mark-dot")) {
            return;
        }

        event.preventDefault();
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
            return;
        }

        const deltaX = event.clientX - panStart.clientX;
        const deltaY = event.clientY - panStart.clientY;

        if (Math.hypot(deltaX, deltaY) > 3) {
            suppressNextCanvasClick = true;
        }

        canvasView.panX = panStart.panX + deltaX;
        canvasView.panY = panStart.panY + deltaY;
        applyCanvasView();
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
        canvas.addEventListener(eventName, (event) => {
            if (panStart && panStart.pointerId === event.pointerId) {
                panStart = null;
                canvas.classList.remove("is-panning");
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
                    placementNote.textContent = `Random spot: ${xField.value}%, ${yField.value}%`;
                    return;
                }
            }

            placementNote.classList.add("error");
            placementNote.textContent = "The wall is crowded here. Try choosing a spot manually.";
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
        updatePanIntent();
    });
    resetCanvasView();
}

if (form && formStatus) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

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
