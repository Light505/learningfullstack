# Performance Analysis

## Benchmark Run (2026-06-05)

Configuration: 10,000 marks, 100 regions, 1366x768 viewport
Command: `npm run benchmark:canvas -- --marks=10000`

For current benchmark usage, output format, and budget guidance, see
[Canvas benchmarking](benchmarking.md).

### Summary

| Scenario | Duration | Key Metric |
|----------|----------|------------|
| Sync | 10,841ms | applyCanvasView avg=1,345ms |
| fitWorld | 377ms avg | renderMapClusters=1,203ms total |
| detailPan | 43ms avg | renderMarksForViewport=1,113ms total |
| **mapPan** | **132ms avg** | **renderMarksForViewport=7,523ms total** |

**Critical finding:** mapPan is the worst performer with p95=1,066ms, max=20,482ms,
89/90 frames >33.3ms (60fps budget). renderMarksForViewport dominates during map panning.

### Capacity Finding

The unified benchmark now reports capacity across 1k, 2k, 5k, 10k, and 20k mark
counts in `canvas-benchmark-summary.json`. Treat the 60fps capacity as the
highest mark count where every scenario keeps p95 below `16.7ms`.

Use the console verdict first:

```powershell
npm run benchmark:canvas
```

For quick local checks while optimizing, run:

```powershell
npm run benchmark:canvas:quick
```

If the verdict drops after a rendering change, inspect the first failing scale
and the hottest function column before changing production code.

### Hot-Path Breakdown

**Sync (initial load):**
- `applyCanvasView` avg=1,345ms per call
- `renderMapClusters` avg=1,298ms per call
- `currentClusters` avg=1,285ms per call

**mapPan (zoom=0.004, panning across world):**
- `applyCanvasView` avg=132ms per call (90 calls)
- `renderMarksForViewport` total=7,523ms (~83ms/call)
- `renderMapClusters` total=1,838ms (~20ms/call)

**detailPan (zoom=1, panning locally):**
- `applyCanvasView` avg=43ms per call (90 calls)
- `renderMarksForViewport` total=1,113ms (~12ms/call)
- `renderMapClusters` total=1,865ms (~21ms/call)

### Root Cause Analysis

#### 1. renderMarksForViewport iterates all marks every frame

At map zoom (0.004), the viewport covers the entire world. With `markRenderBuffer=2`,
`bufferedWorldBounds` includes all 10,000 marks. The function then:

1. Calls `markIsInsideBounds()` for every mark — parses `dataset.x`/`dataset.y` via
   `Number.parseFloat()` each time (20,000 parses per frame)
2. Calls `positionMarkElement()` for every mark — sets 2 CSS custom properties
   via `style.setProperty()` (20,000 setProperty calls per frame)
3. Calls `mountMark()` for every mark — checks `parentElement === canvasWorld`
   (10,000 DOM traversals per frame)

**Total per frame at map zoom:** ~50,000 operations on 10,000 marks.

#### 2. currentClusters rebuilds hierarchy on signature change

`clusterSignature()` concatenates all mark data into a string. During sync, this
invalidates the cache, causing `buildFullClusterHierarchy()` to run union-find
on all 10,000 marks. The hierarchy is O(n) but with constant overhead from
sorting and Map operations.

#### 3. renderMapClusters manipulates DOM for all clusters

At map zoom, `currentClusters()` returns superclusters (top level). The function
creates DOM buttons for each cluster and appends to `mapClusters`. It also
iterates all marks to set `is-clustered` class and coalescing styles.

### Optimization Opportunities

1. **Skip invisible marks in renderMarksForViewport:** When a mark is clustered
   (`.is-clustered`), it has `opacity:0` and `pointer-events:none`. We can skip
   positioning and mounting clustered marks. Only the selected mark and unclustered
   marks need positioning.

2. **Cache mark bounds check:** `markIsInsideBounds` re-parses `dataset.x` on every
   call. Use the existing `markPositions` Map instead.

3. **Defer mark positioning:** `positionMarkElement` only depends on mark x/y and
   `worldBounds`, neither of which change during panning. Cache the last
   positioned signature and skip when unchanged.

4. **Batch DOM operations in renderMapClusters:** Currently creates a new DocumentFragment
   but still iterates all marks to toggle `is-clustered`. Consider using a
   `Set` of clustered UIDs and only touching marks that changed state.

5. **currentClusters cache invalidation:** `clusterSignature()` includes all mark
   styles and positions. During panning, only zoom changes — mark positions are
   static. The signature should not invalidate the cache during pan.

## UI/UX Issues Drafted for GPT 5.5

### Issue #1: Selected cluster highlight alters click behavior
- **Problem:** Clicking a highlighted cluster (the one containing the selected mark)
  jumps directly to the selected mark via `focusSelectedMarkThroughClusters()` instead
  of behaving like a normal cluster zoom-in.
- **Expected:** Cluster click behavior should be consistent regardless of selection
  state. The visual highlight is useful; the special-case click handler is not.
- **Code:** `renderMapClusters()` line ~2000 — the `if (button.dataset.selectedCluster === "true")`
  branch calls `focusSelectedMarkThroughClusters()`.
- **Rough idea:** Remove the special-case branch. Keep `focusSelectedMarkThroughClusters()`
  for the compact popup click handler.

### Issue #2: Locator for selected mark missing at higher zoom levels
- **Problem:** When a selected mark is inside a cluster and off-screen, there is no
  indicator of where it is. The `markPopout` compact state is suppressed when the
  mark is clustered (line 2126).
- **Expected:** A locator indicator should appear when the selected mark is clustered
  and off-screen, and clicking it should traverse to the mark.
- **Code:** `updateSelectedMarkPopout()` line 2126 checks `selectedMark.classList.contains("is-clustered")`
  and hides the popup.
- **Rough idea:** Add a new popup state (e.g., "locator") or separate element that
  shows at the viewport edge pointing toward the selected mark. Reuse the compact
  popup styling but position it at the edge.

### Issue #3: Clicking empty area does not deselect mark
- **Problem:** Clicking on empty canvas area hides the popup but leaves the mark
  selected in the side panel.
- **Expected:** Clicking empty area should fully deselect the mark, clearing the
  side panel preview too.
- **Code:** Document click handler (line ~4600) calls `hideMarkPopout()` but not
  `setEmptyPreview()`.
- **Rough idea:** Add `setEmptyPreview()` to the document click handler, ensuring
  `suppressNextDocumentClick` and `closestElement()` exclusions prevent accidental
  deselection when clicking controls or forms.

### Issue #4: Recent mark navigation skips animation for lone/visible marks
- **Problem:** `focusRecentMarkThroughClusters()` has early returns at
  `markIsVisibleAtIndividualZoom` (line 3510) and `path.length === 0` (line 3520)
  that skip the traversal animation, causing an instant blink.
- **Expected:** All recent mark navigations should play the full cluster traversal
  animation, even for lone marks or marks already visible.
- **Code:** `focusRecentMarkThroughClusters()` lines 3510, 3520.
- **Rough idea:** Remove or modify these early returns so the full animation plays.
  The `markIsVisibleAtIndividualZoom` check should perhaps only skip the zoom-in,
  not the entire sequence.

### Issue #5: Clicking same recent mark twice replays full traversal
- **Problem:** After fixing Issue #4, clicking the same recent mark twice replays
  the full cluster traversal animation.
- **Expected:** If the same mark is already selected and visible, clicking it again
  should be a no-op or a subtle re-focus.
- **Code:** `focusRecentMarkThroughClusters()` — add a guard for already-selected mark.
- **Rough idea:** Check if `currentMark === mark` and `selectedMarkIsInsideCanvasViewport(mark)`
  before starting traversal. If true, skip animation.

## Next Steps

1. Run the unified benchmark to confirm cross-scale capacity
2. Profile `renderMarksForViewport` with mark count vs. time to confirm linear scaling
3. Implement and benchmark the "skip clustered marks" optimization
4. Validate that cluster transitions still work correctly after optimization
