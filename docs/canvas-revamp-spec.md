# Canvas Rendering/Movement/Camera/Interaction Revamp Specification

## Overview

Revamp the Canvas system's rendering, movement, camera snapping, and interaction to provide a polished, mobile-friendly experience with formalized input handling and intuitive grid-based camera snapping.

## Requirements Summary

| Requirement | Target |
|-------------|--------|
| Viewport | 1920x1080 desktop, mobile-phone compatible |
| 100% zoom | Exactly 1 tile (1024x1024px) centered with margin |
| Grid snapping | Camera aligns to tile boundaries at zoom stops |
| Easing | Smooth with momentum and elastic settle |
| Mobile | Touch-optimized with larger snap targets |

---

## 1. Input System Formalization

### 1.1 Unified Input Model

All input interactions flow through a unified system:

| Input Type | Actions |
|------------|---------|
| **Mouse** | Click to place, drag to pan, wheel to zoom |
| **Touch** | Tap to place, drag to pan, pinch to zoom |
| **Keyboard** | +/- zoom, 0 reset, 1 fit 1 tile, F fit world, Space pan |

### 1.2 Pointer Event Handling

- Use `Pointer Events API` for unified mouse/touch handling
- Implement `getPointerCapture()` for continuous tracking outside canvas bounds
- Touch-optimized: larger hit targets (min 44x44px for mobile)

### 1.3 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `+` / `=` | Zoom in one stop |
| `-` | Zoom out one stop |
| `0` | Reset view to default (centered on 0,0 at fit-world zoom) |
| `1` | Zoom to 100% (exactly 1 tile centered) |
| `F` | Fit entire world in viewport |
| `Space` (hold) | Activate keyboard pan mode |
| Arrow keys | Pan in direction (when Space held) |

### 1.4 Gesture Recognition

| Gesture | Action |
|---------|--------|
| Single tap | Place mark at location |
| Drag (3px threshold) | Pan camera |
| Pinch | Zoom in/out centered on pinch midpoint |
| Double-tap | Quick zoom to 100% at tap location |

---

## 2. Zoom System

### 2.1 Zoom Levels

| Zoom Level | Description | Viewport Shows |
|------------|-------------|----------------|
| `fitWorldZoom()` | Fit entire world | Full 201x201 tile map |
| `tileViewZoomForCount(1)` | 100% - 1 tile | Exactly 1 tile (1024px) |
| `tileViewZoomForCount(3)` | 3x3 grid | 3 tiles × 3 tiles |
| `tileViewZoomForCount(5)` | 5x5 grid | 5 tiles × 5 tiles |
| `tileViewZoomForCount(7)` | 7x7 grid | 7 tiles × 7 tiles |
| ... | ... | ... |
| `maxCanvasZoom (2.4)` | Max zoom | ~2.5 tiles × ~2.5 tiles |

### 2.2 Zoom Calculation (Desktop 1920x1080)

```
tileSize = 1024px
viewportWidth = 1920px
viewportHeight = 1080px

fitWorldZoom = min(1920, 1080) / (201 * 1024) = 1080 / 205824 ≈ 0.00524
singleTileZoom = min(1920, 1080) / 1024 = 1080 / 1024 ≈ 1.0547
```

### 2.3 Zoom Behavior

- **100% = 1 tile**: At zoom = 1.0, exactly 1 tile (1024px) fits in the smaller viewport dimension with margin
- **Margin**: 100% zoom centers 1 tile with ~28px margin on sides (1080 - 1024) / 2
- **Snap stops**: Zoom snaps to predefined stops when wheel interaction ends
- **Tile-aligned zoom**: Zoom levels are calculated to show exact tile counts (1, 3, 5, 7, ...)

---

## 3. Camera Grid Snapping

### 3.1 Grid Division Concept

Grid snapping divides the viewport into tile-aligned sections:

| Grid | Tiles Visible | Snap Behavior |
|------|---------------|---------------|
| 1×1 | 1 tile | Center camera on nearest tile center |
| 3×3 | 3×3 tiles | Align camera edges to 1/3 and 2/3 tile boundaries |
| 5×5 | 5×5 tiles | Align camera edges to 1/5, 2/5, 3/5, 4/5 tile boundaries |
| 7×7 | 7×7 tiles | ... |
| ... | ... | ... |

### 3.2 Snap Targets

For a 1920x1080 viewport at various zoom levels:

| Zoom | Viewport Shows | Grid Division |
|------|----------------|----------------|
| ~1.0 | 1 tile | 1×1 (center on tile) |
| ~0.5 | 2.1 tiles | 3×3 (snap to 1/3 tile boundaries) |
| ~0.35 | 3 tiles | 3×3 |
| ~0.25 | 4.2 tiles | 5×5 (snap to 1/5 tile boundaries) |
| ~0.15 | 7 tiles | 7×7 |

### 3.3 Snap Calculation

```
snapGridForZoom(zoom):
    if zoom >= 0.9: return 1x1 grid
    if zoom >= 0.4: return 3x3 grid
    if zoom >= 0.2: return 5x5 grid
    if zoom >= 0.1: return 7x7 grid
    return no snapping (free pan)
```

### 3.4 Camera Snap Behavior

When panning ends OR after zoom settles:

1. **Find snap grid** based on current zoom level
2. **Calculate viewport edges** in world coordinates
3. **Find nearest grid lines** (tile boundaries at 1/tileCount intervals)
4. **Snap camera** so edges align to nearest grid lines
5. **Animate** to snapped position with elastic ease

### 3.5 Mobile-Specific Snap Targets

For touch devices, larger snap tolerances:

| Device | Snap Tolerance | Effect |
|--------|----------------|--------|
| Desktop | 2-5px | Precise snapping to grid lines |
| Mobile | 10-15px | Easier to achieve snap, less frustration |

---

## 4. Pan/Zoom Animation

### 4.1 Easing Functions

```javascript
// Smooth with momentum - primary for camera movement
function easeOutExpo(progress) {
    return progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
}

// Elastic settle - for snapping to grid
function easeOutElastic(progress) {
    const c4 = (2 * Math.PI) / 3;
    return progress === 0
        ? 0
        : progress === 1
            ? 1
            : Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * c4) + 1;
}

// Cubic ease for general use
function easeOutCubic(progress) {
    return 1 - Math.pow(1 - progress, 3);
}
```

### 4.2 Animation Durations

| Animation Type | Duration | Easing |
|---------------|----------|--------|
| Button zoom | 180ms | easeOutCubic |
| Wheel settle | 260-320ms | easeOutCubic |
| Grid snap | 360ms | easeOutElastic |
| Pan settle | 360ms | easeOutCubic |
| Focus mark | 520ms | easeOutExpo |

### 4.3 Momentum/Pan Physics

- **Velocity tracking**: Track pan velocity during drag
- **Inertia decay**: Apply friction decay after release (0.95 per frame)
- **Momentum threshold**: Minimum velocity to trigger momentum (0.5px/frame)
- **Max velocity**: Cap at 50px/frame to prevent extreme flinging

---

## 5. Tile-Aligned Viewport Calculation

### 5.1 Viewport to World Coordinate Transform

```javascript
worldX = worldBounds.minX + ((clientX - panX) / zoom)
worldY = worldBounds.minY + ((clientY - panY) / zoom)
```

### 5.2 Centered 1-Tile View at 100% Zoom

For 1920x1080 viewport at zoom=1.0:

```
tileSize = 1024
viewportWidth = 1920
viewportHeight = 1080
horizontalMargin = (1920 - 1024) / 2 = 448
verticalMargin = (1080 - 1024) / 2 = 28

panX = horizontalMargin = 448
panY = verticalMargin = 28
```

### 5.3 Grid-Aligned Pan Calculation

```javascript
// For 3x3 grid at some zoom where 3 tiles fill viewport
gridDivision = 3
tileFraction = 1 / gridDivision  // 1/3

// Find nearest tile boundary in world coords
worldCoordAtEdge = ...
nearestGridLine = Math.round(worldCoordAtEdge / (tileSize * tileFraction)) * (tileSize * tileFraction)

// Calculate pan to align viewport edge to grid line
alignedPanX = edgeClientX - (worldCoord - worldBounds.minX) * zoom
```

---

## 6. Mobile Optimization

### 6.1 Touch Handling

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Tap threshold | 3px | 10px movement allowed |
| Pan threshold | 3px | 15px to prevent accidental pans |
| Snap tolerance | 2-5px | 10-15px |
| Pinch sensitivity | Standard | 1.5x boost for natural feel |

### 6.2 Touch-Friendly UI

- **Minimum touch target**: 44x44px for all interactive elements
- **Button sizing**: Larger zoom/pan buttons on mobile
- **Placement marker**: Larger crosshair/indicator on touch
- **Grid snap toggle**: Option to disable for free navigation on mobile

### 6.3 Viewport Responsiveness

- Recalculate `fitWorldZoom` on resize
- Recalculate snap stops on resize
- Handle orientation changes gracefully

---

## 7. Current Code to Retain

Based on codebase analysis, these functions are well-implemented and should be retained/refined:

| Function | Location | Purpose |
|----------|----------|---------|
| `animateCanvasViewTo()` | 1125-1168 | RAF-based animation (refine easing) |
| `tileSnappedCanvasView()` | 794-800 | Core tile snapping logic |
| `centeredCanvasViewForCoordinate()` | 784-792 | Calculate centered view |
| `zoomSnapStopItems()` | 659-695 | Generate zoom snap stops |
| `tileViewZoomForCount()` | 642-649 | Calculate zoom for tile count |
| `canvasPanBounds()` | 126-152 | Pan boundary calculation |
| `rubberbandPan()` | 164-174 | Elastic bounce-back |
| `settleCanvasView()` | 1170-1197 | Settle camera after pan/zoom |
| `wheelDeltaPixels()` | 1371-1381 | Handle wheel event deltas |
| `easeOutCubic()` | N/A | Current easing function |

---

## 8. Implementation Phases

### Phase 1: Input Formalization
- Audit and document all input handlers
- Implement unified pointer handling
- Add keyboard shortcut handlers
- Add gesture recognition for touch

### Phase 2: Zoom System Refinement
- Verify 100% = 1 tile behavior
- Calculate optimal snap stop intervals
- Implement zoom snap with tile alignment

### Phase 3: Grid Snapping Implementation
- Implement `snapToGrid()` function
- Add grid calculation based on zoom level
- Implement snap animation with elastic ease
- Add mobile-specific snap tolerances

### Phase 4: Animation Polish
- Refine easing functions (add easeOutElastic)
- Implement momentum/pan physics
- Tune animation durations
- Add reduced-motion preference support

### Phase 5: Mobile Optimization
- Add touch-specific tolerances
- Implement larger snap targets for touch
- Add viewport responsiveness
- Test and tune for mobile

---

## 9. Testing Checklist

- [ ] 100% zoom shows exactly 1 tile centered with margin
- [ ] Zoom snap stops work correctly (1, 3, 5, 7... tiles)
- [ ] Grid snapping aligns viewport to tile boundaries
- [ ] Camera settles smoothly with momentum
- [ ] Keyboard shortcuts all functional
- [ ] Touch panning feels natural
- [ ] Pinch-to-zoom works on mobile
- [ ] Double-tap zooms to 100% at location
- [ ] Grid snap feels easier on mobile (larger tolerance)
- [ ] Reduced motion preference respected
- [ ] No console errors during interaction
- [ ] Smooth 60fps during pan/zoom animations