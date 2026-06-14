# Canvas Benchmarking

The canvas benchmark is a Playwright-driven frontend benchmark for the shared
mark canvas. It blocks live mark streams, injects synthetic marks through the
existing test hooks, and measures rendering work across several mark counts.

## Prerequisites

- Docker app running at `http://localhost:8080`.
- npm dependencies installed with `npm install`.
- Chromium installed for Playwright:

```powershell
npx playwright install chromium
```

## Quick Runs

Run the full cross-scale benchmark:

```powershell
npm run benchmark:canvas
```

This runs 1k, 2k, 5k, 10k, and 20k marks. Expect roughly 5-10 minutes,
depending on the machine.

Run the fast feedback benchmark:

```powershell
npm run benchmark:canvas:quick
```

This runs only 5k marks and usually takes 1-2 minutes.

Run one specific scale:

```powershell
npm run benchmark:canvas -- --marks=2000
```

Write results to a custom flat output directory:

```powershell
npm run benchmark:canvas -- --output=test-results/my-run
```

Open a visible browser for debugging:

```powershell
npm run benchmark:canvas -- --marks=5000 --headful
```

Tune the p95 budget used in the capacity verdict:

```powershell
npm run benchmark:canvas -- --budget=33.3
```

## What It Measures

- `sync`: injects the synthetic marks and records initial sync/render work.
- `fitWorld`: clicks the Fit whole world control and samples frames while the
  canvas transitions into map view.
- `detailPan`: pans at detail zoom, where individual marks are expected to be
  interactive.
- `mapPan`: pans at map zoom across the world, where clustering and culling are
  most important.
- `clusterDrilldown`: repeatedly zooms into the largest cluster path until it
  reaches individual marks or no deeper cluster exists.

Each scenario records frame deltas, hot function timings, memory snapshots,
visibility state, and scenario-specific metrics.

## Reading Output

The console prints a cross-scale table. The most important column is `p95`,
which means 95% of sampled frames completed at or below that frame delta.

The capacity verdict reports the highest mark count where every scenario stays
under the selected p95 budget:

```text
Device capacity: 5000 marks at p95 < 16.7ms (60fps budget).
```

The default budget is `16.7ms`, the approximate frame budget for 60fps. The
report also shows 30fps context at `33.3ms` and jank context at `50ms`.

If `p95` exceeds `16.7ms`, users may see missed 60fps frames. If it exceeds
`33.3ms`, visible stutter is more likely. Use
[performance-analysis.md](performance-analysis.md) for root-cause guidance.

## JSON Files

The output directory is flat. A full run writes:

```text
canvas-benchmark-1000.json
canvas-benchmark-2000.json
canvas-benchmark-5000.json
canvas-benchmark-10000.json
canvas-benchmark-20000.json
canvas-benchmark-summary.json
```

Each per-count file includes:

- `metadata`: run configuration and environment.
- `config`: mark count, regions, pan frames, sampling duration, and viewport.
- `clusters`: cluster counts and average cluster sizes by level.
- `scenarios`: per-scenario frames, frame summaries, function stats, memory,
  visibility, and extra metrics.

The summary file includes:

- `metadata`: combined run configuration and output filenames.
- `capacity`: primary budget, 60fps/30fps/jank capacity, and failures by mark
  count.
- `results`: compact per-count scenario summaries and hottest functions.

## Performance Guidance

Use `npm run benchmark:canvas:quick` before and after frontend rendering changes.
Use the full benchmark when changing clustering, mark rendering, canvas view
logic, or DOM culling behavior.

Investigate scenarios where:

- p95 rises above `16.7ms` for a supported mark count.
- p95 or max frame time regresses sharply from a previous run.
- heap growth keeps increasing across related scenarios.
- the hottest function changes unexpectedly.
