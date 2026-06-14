#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const DEFAULTS = {
  url: "http://localhost:8080/",
  marks: null,
  regions: 100,
  panFrames: 90,
  fitSampleMs: 900,
  width: 1366,
  height: 768,
  output: "test-results",
  headful: false,
  budget: 16.7,
};

const DEFAULT_MARK_COUNTS = [1000, 2000, 5000, 10000, 20000];
const SCENARIOS = ["sync", "fitWorld", "detailPan", "mapPan", "clusterDrilldown"];
const THRESHOLDS = [
  { key: "fps60", label: "60fps", budget: 16.7 },
  { key: "fps30", label: "30fps", budget: 33.3 },
  { key: "jank", label: "jank", budget: 50 },
];

const INSTRUMENTED_FUNCTIONS = [
  "applyCanvasView",
  "renderMarksForViewport",
  "renderMapClusters",
  "currentClusters",
  "renderFogCanvas",
  "renderCanvasTiles",
  "buildFullClusterHierarchy",
  "clusterMarksForRadius",
  "positionMarkElement",
  "markIsInsideBounds",
  "mountMark",
  "unmountMark",
  "updateSelectedMarkPopout",
  "setClusterTransitionMode",
  "zoomIntoCluster",
  "animateCanvasViewTo",
  "markClusterItems",
  "fullClusterHierarchy",
];

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  argv.forEach((arg) => {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      return;
    }

    if (arg === "--headful") {
      options.headful = true;
      return;
    }

    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const [, rawKey, rawValue] = match;
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      throw new Error(`Unknown option: --${rawKey}`);
    }

    if (["marks", "regions", "panFrames", "fitSampleMs", "width", "height"].includes(key)) {
      const value = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`--${rawKey} must be a positive integer`);
      }
      options[key] = value;
      return;
    }

    if (key === "budget") {
      const value = Number.parseFloat(rawValue);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--budget must be a positive number");
      }
      options[key] = value;
      return;
    }

    options[key] = rawValue;
  });

  return options;
}

function printHelp() {
  console.log([
    "Unified canvas benchmark",
    "",
    "Usage:",
    "  npm run benchmark:canvas",
    "  npm run benchmark:canvas:quick",
    "  npm run benchmark:canvas -- --marks=2000",
    "  npm run benchmark:canvas -- --output=test-results/my-run --budget=33.3",
    "",
    "What it does:",
    "  Runs synthetic frontend canvas benchmarks against a local app, blocks live",
    "  backend mark streams, injects generated marks through test hooks, and prints",
    "  a cross-scale capacity verdict.",
    "",
    "Scenarios:",
    "  sync              Inject marks and measure initial canvas/render sync.",
    "  fitWorld          Click Fit whole world and sample frames during map transition.",
    "  detailPan         Synthetic pan at detail zoom.",
    "  mapPan            Synthetic pan at map zoom across the world.",
    "  clusterDrilldown  Repeatedly zoom into the largest cluster path.",
    "",
    "Options:",
    "  --url=<url>             App URL. Default: http://localhost:8080/",
    "  --marks=<count>         Run one mark count. Default: 1000, 2000, 5000, 10000, 20000.",
    "  --regions=<count>       Number of synthetic mark regions. Default: 100",
    "  --pan-frames=<count>    Frames per synthetic pan scenario. Default: 90",
    "  --fit-sample-ms=<ms>    Fit-world frame sample duration. Default: 900",
    "  --width=<px>            Browser viewport width. Default: 1366",
    "  --height=<px>           Browser viewport height. Default: 768",
    "  --output=<dir>          JSON output directory. Default: test-results",
    "  --budget=<ms>           p95 frame budget for capacity verdict. Default: 16.7",
    "  --headful               Run Chromium with a visible browser window.",
    "  --help                  Show this help.",
    "",
    "Examples:",
    "  npm run benchmark:canvas",
    "  npm run benchmark:canvas:quick",
    "  npm run benchmark:canvas -- --marks=5000 --headful",
    "  npm run benchmark:canvas -- --marks=20000 --output=test-results/canvas-20k",
    "  npm run benchmark:canvas -- --budget=33.3",
    "",
    "Output files:",
    "  canvas-benchmark-{marks}.json",
    "  canvas-benchmark-summary.json",
  ].join("\n"));
}

function makeMarks(count, regions) {
  const colors = ["#86a6c9", "#f0b35a", "#d9826b", "#9fc5a8", "#b48ead"];
  const shapes = ["circle", "square", "diamond"];
  const galaxySpacing = 15000;
  const systemSpacing = 4300;
  const neighborSpacing = 1050;
  const regionCols = Math.max(1, Math.ceil(Math.sqrt(regions)));
  const maxMarksPerRegion = Math.max(1, Math.ceil(count / regions));
  const localCols = Math.max(1, Math.ceil(Math.sqrt(maxMarksPerRegion)));
  const localSpacing = 32;
  const galaxyOffsets = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ];
  const systemOffsets = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const neighborOffsets = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const marks = [];

  for (let index = 0; index < count; index += 1) {
    const region = index % regions;
    const local = Math.floor(index / regions);
    const galaxyIndex = Math.floor((region * 4) / regions);
    const localRegion = region - Math.floor((galaxyIndex * regions) / 4);
    const systemIndex = Math.floor(localRegion / 5) % systemOffsets.length;
    const neighborIndex = localRegion % neighborOffsets.length;
    const fallbackX = (region % regionCols) - Math.floor(regionCols / 2);
    const fallbackY = Math.floor(region / regionCols) - Math.floor(regionCols / 2);
    const galaxy = galaxyOffsets[galaxyIndex] || [fallbackX, fallbackY];
    const system = systemOffsets[systemIndex] || [0, 0];
    const neighbor = neighborOffsets[neighborIndex] || [0, 0];
    const localX = (local % localCols) * localSpacing;
    const localY = Math.floor(local / localCols) * localSpacing;
    const x = (galaxy[0] * galaxySpacing)
      + (system[0] * systemSpacing)
      + (neighbor[0] * neighborSpacing)
      + localX;
    const y = (galaxy[1] * galaxySpacing)
      + (system[1] * systemSpacing)
      + (neighbor[1] * neighborSpacing)
      + localY;

    marks.push({
      uid: `bench-${index}`,
      display_name: `Bench ${index}`,
      message: "Benchmark mark",
      drawing: null,
      x_percent: String(x),
      y_percent: String(y),
      color: colors[index % colors.length],
      shape: shapes[index % shapes.length],
      created_at: "2026-06-05 00:00:00",
    });
  }

  return marks;
}

function roundMetric(value) {
  return Number((value || 0).toFixed(2));
}

function summarizeFrames(frames) {
  const sorted = [...frames].sort((a, b) => a - b);
  const percentile = (value) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] || 0;
  const average = frames.reduce((sum, value) => sum + value, 0) / Math.max(1, frames.length);
  const variance = frames.reduce((sum, value) => sum + ((value - average) ** 2), 0) / Math.max(1, frames.length);

  return {
    count: frames.length,
    avg: roundMetric(average),
    p50: roundMetric(percentile(0.50)),
    p95: roundMetric(percentile(0.95)),
    p99: roundMetric(percentile(0.99)),
    max: roundMetric(Math.max(0, ...frames)),
    stddev: roundMetric(Math.sqrt(variance)),
    over16_7: frames.filter((value) => value > 16.7).length,
    over33_3: frames.filter((value) => value > 33.3).length,
    over50: frames.filter((value) => value > 50).length,
  };
}

async function installBenchmarkHooks(page) {
  await page.evaluate((functionNames) => {
    const makeStats = () => Object.fromEntries(functionNames.map((name) => [
      name,
      { calls: 0, total: 0, max: 0, firstAt: null, available: typeof window[name] === "function" },
    ]));

    window.__canvasBench = {
      active: "boot",
      stats: {},
      frames: {},
      metadata: {},
      functionNames,
    };

    window.__canvasBenchReset = (label) => {
      window.__canvasBench.active = label;
      window.__canvasBench.stats[label] = makeStats();
      window.__canvasBench.frames[label] = [];
      window.__canvasBench.metadata[label] = {};
    };

    const memorySnapshot = () => {
      if (!performance.memory) {
        return { usedJSHeapSize: null, totalJSHeapSize: null };
      }

      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
      };
    };

    window.__canvasBenchMemory = memorySnapshot;

    functionNames.forEach((name) => {
      const original = window[name];
      if (typeof original !== "function") {
        return;
      }

      window[name] = function wrappedCanvasBenchmarkFunction(...args) {
        const label = window.__canvasBench.active || "default";
        const stats = window.__canvasBench.stats[label] || (window.__canvasBench.stats[label] = makeStats());
        const item = stats[name] || (stats[name] = { calls: 0, total: 0, max: 0, firstAt: null, available: true });
        const startedAt = performance.now();

        try {
          return original.apply(this, args);
        } finally {
          const duration = performance.now() - startedAt;
          item.calls += 1;
          item.total += duration;
          item.max = Math.max(item.max, duration);
          item.available = true;
          if (item.firstAt === null) {
            item.firstAt = startedAt;
          }
        }
      };
    });

    window.__canvasBenchSampleFrames = (label, durationMs) => new Promise((resolve) => {
      const deltas = [];
      let lastFrameAt = performance.now();
      const stopAt = lastFrameAt + durationMs;

      const sample = (now) => {
        deltas.push(now - lastFrameAt);
        lastFrameAt = now;

        if (now < stopAt) {
          requestAnimationFrame(sample);
          return;
        }

        window.__canvasBench.frames[label] = deltas;
        resolve(deltas);
      };

      requestAnimationFrame(sample);
    });

    window.__canvasBenchSyntheticPan = (label, zoom, centerX, centerY, deltaX, frames) => new Promise((resolve) => {
      const canvas = document.querySelector("[data-mark-canvas]");
      const rect = canvas.getBoundingClientRect();
      const minCoordinate = Number.parseFloat(canvas.dataset.minCoordinate || "-102400");
      const deltas = [];
      const dispatchDurations = [];
      let lastFrameAt = performance.now();
      let frame = 0;

      window.__canvasBenchReset(label);

      const step = (now) => {
        deltas.push(now - lastFrameAt);
        lastFrameAt = now;

        const progress = frame / Math.max(1, frames - 1);
        const panX = (rect.width / 2) - ((centerX + (deltaX * progress) - minCoordinate) * zoom);
        const panY = (rect.height / 2) - ((centerY - minCoordinate) * zoom);
        const startedAt = performance.now();

        window.dispatchEvent(new CustomEvent("test:setCanvasView", {
          detail: { zoom, panX, panY, clamp: false },
        }));
        dispatchDurations.push(performance.now() - startedAt);

        frame += 1;
        if (frame < frames) {
          requestAnimationFrame(step);
          return;
        }

        window.__canvasBench.frames[label] = deltas;
        window.__canvasBench.stats[label].syntheticDispatch = {
          calls: dispatchDurations.length,
          total: dispatchDurations.reduce((sum, value) => sum + value, 0),
          max: Math.max(0, ...dispatchDurations),
          firstAt: null,
          available: true,
        };
        resolve({ frames: deltas, dispatchDurations });
      };

      requestAnimationFrame(step);
    });

    window.__canvasBenchSyncMarks = (payload) => new Promise((resolve) => {
      window.__canvasBenchReset("sync");
      const loadStartedAt = performance.now();
      const memoryBefore = memorySnapshot();

      requestAnimationFrame((firstFrameAt) => {
        const syncStartedAt = performance.now();
        window.dispatchEvent(new CustomEvent("test:syncMarks", { detail: payload }));
        const syncDuration = performance.now() - syncStartedAt;
        const apply = window.__canvasBench.stats.sync.applyCanvasView;

        requestAnimationFrame((afterFrameAt) => {
          const frames = [afterFrameAt - firstFrameAt];
          window.__canvasBench.frames.sync = frames;
          resolve({
            frames,
            memoryBefore,
            memoryAfter: memorySnapshot(),
            metrics: {
              initialLoadTime: syncStartedAt - loadStartedAt,
              syncDuration,
              timeToFirstApplyCanvasView: apply?.firstAt === null ? null : apply.firstAt - syncStartedAt,
            },
          });
        });
      });
    });

    window.__canvasBenchClusterMetrics = () => {
      const levelNames = ["supercluster", "galaxy", "system", "neighbor"];
      const hierarchy = buildFullClusterHierarchy(markClusterItems());
      const clusteredByLevel = new Map();
      const allClusteredUids = new Set();
      let maxClusterDepth = 0;

      levelNames.forEach((levelName, index) => {
        const clusters = (hierarchy[index] || []).filter((cluster) => cluster.count > 1 && cluster.level === levelName);
        clusters.forEach((cluster) => {
          cluster.marks.forEach((mark) => {
            const uid = markUid(mark);
            if (!uid) {
              return;
            }
            allClusteredUids.add(uid);
            clusteredByLevel.set(uid, (clusteredByLevel.get(uid) || 0) + 1);
          });
        });
      });

      clusteredByLevel.forEach((depth) => {
        maxClusterDepth = Math.max(maxClusterDepth, depth);
      });

      const levels = Object.fromEntries(levelNames.map((levelName, index) => {
        const clusters = (hierarchy[index] || []).filter((cluster) => cluster.count > 1 && cluster.level === levelName);
        const totalSize = clusters.reduce((sum, cluster) => sum + cluster.count, 0);

        return [levelName, {
          clusters: clusters.length,
          averageClusterSize: Number((totalSize / Math.max(1, clusters.length)).toFixed(2)),
        }];
      }));

      const totalMarks = marks.length;

      return {
        levels,
        loneMarks: Math.max(0, totalMarks - allClusteredUids.size),
        maxClusterDepth,
      };
    };

    window.__canvasBenchVisibility = () => {
      const canvas = document.querySelector("[data-mark-canvas]");
      const bounds = canvas ? bufferedWorldBounds(visibleWorldBounds(), markRenderBuffer) : null;
      const selected = selectedCanvasMark();
      const selectedPosition = selected ? selectedMarkScreenPosition(selected) : null;
      const passingBounds = bounds
        ? marks.filter((mark) => markIsInsideBounds(mark, bounds)).length
        : marks.length;

      return {
        totalMarks: marks.length,
        marksPassingBounds: passingBounds,
        renderedMarkCount: Number.parseInt(canvas?.dataset.renderedMarkCount || "0", 10),
        domMarks: document.querySelectorAll(".mark-dot").length,
        clusteredMarks: document.querySelectorAll(".mark-dot.is-clustered").length,
        mapClusters: document.querySelectorAll(".map-cluster").length,
        renderMode: canvas?.dataset.renderMode || "",
        selectedMark: selected
          ? {
              visible: selectedMarkIsInsideCanvasViewport(selected),
              clustered: selected.classList.contains("is-clustered"),
              offScreen: selectedPosition ? !selectedMarkIsInsideCanvasViewport(selected) : true,
              uid: markUid(selected),
            }
          : { visible: false, clustered: false, offScreen: false, uid: null },
      };
    };

    window.__canvasBenchDrilldown = async () => {
      window.__canvasBenchReset("clusterDrilldown");
      const hierarchy = buildFullClusterHierarchy(markClusterItems());
      const levelNames = ["supercluster", "galaxy", "system", "neighbor"];
      const candidates = (hierarchy[0] || [])
        .filter((cluster) => cluster.count > 1 && cluster.level === "supercluster")
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
      const root = candidates[0] || null;
      const frames = [];
      const steps = [];
      const totalStartedAt = performance.now();
      let lastFrameAt = totalStartedAt;
      let sampling = true;

      const sampleFrames = () => {
        if (!sampling) {
          return;
        }
        requestAnimationFrame((now) => {
          frames.push(now - lastFrameAt);
          lastFrameAt = now;
          sampleFrames();
        });
      };
      sampleFrames();

      let currentCluster = root || clusterPathForCurrentViewport(hierarchy)[0]?.cluster || null;
      while (currentCluster && currentCluster.count > 1) {
        const startedAt = performance.now();
        const result = await zoomIntoCluster(currentCluster, {
          timing: { camera: 420, settle: 120 },
        });
        const endedAt = performance.now();
        const nextLevel = result?.explosion?.levelIndex >= levelNames.length
          ? "mark"
          : levelNames[result?.explosion?.levelIndex] || null;

        steps.push({
          level: currentCluster.level || "cluster",
          clusterId: currentCluster.id,
          markCount: currentCluster.count,
          duration: Number((endedAt - startedAt).toFixed(2)),
          nextLevel,
        });

        const nextCluster = (result?.explosion?.children || [])
          .filter((cluster) => cluster.count > 1)
          .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))[0] || null;

        if (!nextCluster || nextLevel === "mark") {
          currentCluster = null;
        } else {
          currentCluster = nextCluster;
        }
      }

      sampling = false;
      window.__canvasBench.frames.clusterDrilldown = frames;

      return {
        frames,
        metrics: {
          totalTraversalTime: Number((performance.now() - totalStartedAt).toFixed(2)),
          steps,
          missingLevels: levelNames.filter((levelName) => !steps.some((step) => step.level === levelName)),
        },
      };
    };
  }, INSTRUMENTED_FUNCTIONS);
}

async function collectScenario(page, label, memoryBefore, extraMetrics = {}) {
  const data = await page.evaluate((scenarioLabel) => {
    const bench = window.__canvasBench;
    const stats = {};
    Object.entries(bench.stats[scenarioLabel] || {}).forEach(([name, item]) => {
      stats[name] = {
        available: item.available !== false,
        calls: item.calls || 0,
        total: Number((item.total || 0).toFixed(2)),
        avg: Number(((item.total || 0) / Math.max(1, item.calls || 0)).toFixed(2)),
        max: Number((item.max || 0).toFixed(2)),
        firstAt: item.firstAt === null ? null : Number(item.firstAt.toFixed(2)),
      };
    });

    return {
      frames: bench.frames[scenarioLabel] || [],
      stats,
      memoryAfter: window.__canvasBenchMemory(),
      visibility: window.__canvasBenchVisibility(),
    };
  }, label);

  const usedBefore = memoryBefore?.usedJSHeapSize;
  const usedAfter = data.memoryAfter?.usedJSHeapSize;
  const heapGrowthUsed = usedBefore === null || usedAfter === null ? null : usedAfter - usedBefore;

  return {
    name: label,
    frames: data.frames.map((value) => Number(value.toFixed(2))),
    frameSummary: summarizeFrames(data.frames),
    stats: data.stats,
    memory: {
      before: memoryBefore,
      after: data.memoryAfter,
      heapGrowthUsed,
    },
    visibility: data.visibility,
    metrics: extraMetrics,
  };
}

async function runConfig(options, markCount) {
  const browser = await chromium.launch({ headless: !options.headful });
  const page = await browser.newPage({ viewport: { width: options.width, height: options.height } });
  const scenarios = [];

  await page.addInitScript(() => {
    window.EventSource = class {
      addEventListener() {}
      close() {}
    };
  });
  await page.route("**/api/marks-stream.php", (route) => route.abort());
  await page.route("**/api/marks.php", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, count: 0, marks: [], mark_uids: [] }),
      });
    }

    return route.continue();
  });

  try {
    const navigationStartedAt = Date.now();
    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    await installBenchmarkHooks(page);

    const marks = makeMarks(markCount, options.regions);
    const payload = {
      ok: true,
      count: marks.length,
      marks,
      recent_marks: marks.slice(0, 10),
      mark_uids: marks.map((mark) => mark.uid),
    };

    const syncResult = await page.evaluate((syncPayload) => window.__canvasBenchSyncMarks(syncPayload), payload);
    syncResult.metrics.pageLoadDuration = Date.now() - navigationStartedAt;
    scenarios.push(await collectScenario(page, "sync", syncResult.memoryBefore, syncResult.metrics));

    const clusters = await page.evaluate(() => window.__canvasBenchClusterMetrics());

    await page.evaluate(() => window.__canvasBenchReset("fitWorld"));
    const fitMemoryBefore = await page.evaluate(() => window.__canvasBenchMemory());
    const fitBeforeVisibility = await page.evaluate(() => window.__canvasBenchVisibility());
    const fitStartedAt = Date.now();
    const fitFrames = page.evaluate((durationMs) => window.__canvasBenchSampleFrames("fitWorld", durationMs), options.fitSampleMs);
    await page.getByLabel("Fit whole world").click();
    await fitFrames;
    await page.waitForFunction(() => (
      document.querySelectorAll('.mark-dot[data-coalescing="true"], .mark-dot[data-expanding="true"]').length === 0
    ), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(100);
    const fitAfterVisibility = await page.evaluate(() => window.__canvasBenchVisibility());
    scenarios.push(await collectScenario(page, "fitWorld", fitMemoryBefore, {
      zoomToWorldDuration: Date.now() - fitStartedAt,
      marksCoalesced: Math.max(0, fitAfterVisibility.clusteredMarks - fitBeforeVisibility.clusteredMarks),
    }));

    const detailMemoryBefore = await page.evaluate(() => window.__canvasBenchMemory());
    await page.evaluate((frames) => window.__canvasBenchSyntheticPan("detailPan", 1, 0, 0, 6000, frames), options.panFrames);
    scenarios.push(await collectScenario(page, "detailPan", detailMemoryBefore, {
      zoom: 1,
      panFrames: options.panFrames,
    }));

    const mapMemoryBefore = await page.evaluate(() => window.__canvasBenchMemory());
    await page.evaluate((frames) => window.__canvasBenchSyntheticPan("mapPan", 0.004, 0, 0, 120000, frames), options.panFrames);
    scenarios.push(await collectScenario(page, "mapPan", mapMemoryBefore, {
      zoom: 0.004,
      panFrames: options.panFrames,
    }));

    const drillMemoryBefore = await page.evaluate(() => window.__canvasBenchMemory());
    const drillResult = await page.evaluate(() => window.__canvasBenchDrilldown());
    scenarios.push(await collectScenario(page, "clusterDrilldown", drillMemoryBefore, drillResult.metrics));

    return {
      metadata: {
        benchmark: "canvas-unified",
        timestamp: new Date().toISOString(),
        config: {
          marks: markCount,
          regions: options.regions,
          panFrames: options.panFrames,
          fitSampleMs: options.fitSampleMs,
          viewport: { width: options.width, height: options.height },
          url: options.url,
          headless: !options.headful,
          budget: options.budget,
        },
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          browser: "chromium",
          navigationStartedAt,
        },
      },
      config: {
        marks: markCount,
        regions: options.regions,
        panFrames: options.panFrames,
        fitSampleMs: options.fitSampleMs,
        viewport: { width: options.width, height: options.height },
      },
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        browser: "chromium",
      },
      clusters,
      scenarios,
    };
  } finally {
    await browser.close();
  }
}

function outputDir(options) {
  return path.resolve(options.output || "test-results");
}

function writeResult(options, result) {
  const dir = outputDir(options);
  const outputPath = path.join(dir, `canvas-benchmark-${result.config.marks}.json`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  return outputPath;
}

function scenarioFailures(result, budget) {
  return result.scenarios
    .filter((scenario) => scenario.frameSummary.p95 >= budget)
    .map((scenario) => ({
      scenario: scenario.name,
      p95: scenario.frameSummary.p95,
      budget,
    }));
}

function highestPassingMarkCount(results, budget) {
  const sorted = [...results].sort((a, b) => a.config.marks - b.config.marks);
  let highest = null;

  sorted.forEach((result) => {
    if (scenarioFailures(result, budget).length === 0) {
      highest = result.config.marks;
    }
  });

  return highest;
}

function capacityAnalysis(results, budget) {
  const capacities = Object.fromEntries(THRESHOLDS.map((threshold) => [
    threshold.key,
    {
      label: threshold.label,
      budget: threshold.budget,
      highestPassingMarks: highestPassingMarkCount(results, threshold.budget),
    },
  ]));

  return {
    primaryBudget: budget,
    primaryCapacity: {
      budget,
      highestPassingMarks: highestPassingMarkCount(results, budget),
    },
    capacities,
    byMarkCount: results
      .slice()
      .sort((a, b) => a.config.marks - b.config.marks)
      .map((result) => ({
        marks: result.config.marks,
        scenarios: Object.fromEntries(result.scenarios.map((scenario) => [
          scenario.name,
          {
            p95: scenario.frameSummary.p95,
            passPrimaryBudget: scenario.frameSummary.p95 < budget,
          },
        ])),
        failures: scenarioFailures(result, budget),
      })),
  };
}

function writeSummary(options, results, outputPaths, analysis) {
  const dir = outputDir(options);
  const outputPath = path.join(dir, "canvas-benchmark-summary.json");
  const summary = {
    metadata: {
      benchmark: "canvas-unified-summary",
      timestamp: new Date().toISOString(),
      markCounts: results.map((result) => result.config.marks),
      outputFiles: outputPaths.map((item) => path.basename(item)),
      options: {
        url: options.url,
        regions: options.regions,
        panFrames: options.panFrames,
        fitSampleMs: options.fitSampleMs,
        viewport: { width: options.width, height: options.height },
        headless: !options.headful,
        budget: options.budget,
      },
    },
    capacity: analysis,
    results: results.map((result) => ({
      marks: result.config.marks,
      clusters: result.clusters,
      scenarios: result.scenarios.map((scenario) => ({
        name: scenario.name,
        frameSummary: scenario.frameSummary,
        memory: scenario.memory,
        visibility: scenario.visibility,
        metrics: scenario.metrics,
        hottestFunction: hottestFunction(scenario),
      })),
    })),
  };

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  return outputPath;
}

function formatBytes(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  const mib = value / (1024 * 1024);
  return `${mib.toFixed(1)}MiB`;
}

function hottestFunction(scenario) {
  const hot = Object.entries(scenario.stats)
    .filter(([, stat]) => stat.calls > 0)
    .sort(([, a], [, b]) => b.total - a.total)[0];

  if (!hot) {
    return null;
  }

  return {
    name: hot[0],
    calls: hot[1].calls,
    total: hot[1].total,
    avg: hot[1].avg,
    max: hot[1].max,
  };
}

function printSummary(results, outputPaths, summaryPath, analysis) {
  const lines = [
    "Canvas Benchmark Cross-Scale Comparison",
    "",
    "| Marks | Scenario | p50 | p95 | p99 | Max | Stddev | >16.7 | >33.3 | >50 | DOM | Clustered | Heap Growth | Hot Function |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  results.forEach((result) => {
    SCENARIOS.forEach((scenarioName) => {
      const scenario = result.scenarios.find((item) => item.name === scenarioName);
      if (!scenario) {
        return;
      }

      const hot = hottestFunction(scenario);
      const hotLabel = hot ? `${hot.name} ${hot.total}ms` : "";

      lines.push([
        result.config.marks,
        scenario.name,
        scenario.frameSummary.p50,
        scenario.frameSummary.p95,
        scenario.frameSummary.p99,
        scenario.frameSummary.max,
        scenario.frameSummary.stddev,
        `${scenario.frameSummary.over16_7}/${scenario.frameSummary.count}`,
        `${scenario.frameSummary.over33_3}/${scenario.frameSummary.count}`,
        `${scenario.frameSummary.over50}/${scenario.frameSummary.count}`,
        scenario.visibility.domMarks,
        scenario.visibility.clusteredMarks,
        formatBytes(scenario.memory.heapGrowthUsed),
        hotLabel,
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    });
  });

  const primary = analysis.primaryCapacity;
  const fps30 = analysis.capacities.fps30;
  const jank = analysis.capacities.jank;
  const highestMeasured = Math.max(...results.map((result) => result.config.marks));
  const primaryLabel = primary.highestPassingMarks === null
    ? `below ${Math.min(...results.map((result) => result.config.marks))} marks`
    : `${primary.highestPassingMarks} marks`;
  const primaryBudgetLabel = primary.budget === 16.7 ? "60fps budget" : "configured budget";

  lines.push(
    "",
    "Capacity Verdict",
    `Device capacity: ${primaryLabel} at p95 < ${primary.budget}ms (${primaryBudgetLabel}).`,
    `30fps context: ${fps30.highestPassingMarks === null ? "below measured range" : `${fps30.highestPassingMarks} marks`} at p95 < ${fps30.budget}ms.`,
    `Jank context: ${jank.highestPassingMarks === null ? "below measured range" : `${jank.highestPassingMarks} marks`} at p95 < ${jank.budget}ms.`,
  );

  if (primary.highestPassingMarks !== highestMeasured) {
    const firstFailure = analysis.byMarkCount.find((entry) => entry.failures.length > 0);
    if (firstFailure) {
      const failing = firstFailure.failures
        .map((failure) => `${failure.scenario} p95=${failure.p95}ms`)
        .join(", ");
      lines.push(`First failing scale: ${firstFailure.marks} marks (${failing}).`);
    }
  }

  lines.push("");
  outputPaths.forEach((item) => {
    lines.push(`Wrote JSON results to ${item}`);
  });
  lines.push(`Wrote summary JSON to ${summaryPath}`);

  console.log(lines.join("\n"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const markCounts = options.marks ? [options.marks] : DEFAULT_MARK_COUNTS;
  const results = [];
  const outputPaths = [];

  for (const markCount of markCounts) {
    console.log(`Running canvas benchmark for ${markCount} marks...`);
    const result = await runConfig(options, markCount);
    results.push(result);
    outputPaths.push(writeResult(options, result));
  }

  const analysis = capacityAnalysis(results, options.budget);
  const summaryPath = writeSummary(options, results, outputPaths, analysis);
  printSummary(results, outputPaths, summaryPath, analysis);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
