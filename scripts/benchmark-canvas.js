#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const DEFAULTS = {
  url: "http://localhost:8080/",
  marks: 10000,
  regions: 100,
  panFrames: 90,
  fitSampleMs: 900,
  width: 1366,
  height: 768,
  output: "",
  headful: false,
};

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

    options[key] = rawValue;
  });

  return options;
}

function printHelp() {
  console.log([
    "Canvas benchmark",
    "",
    "Usage:",
    "  npm run benchmark:canvas",
    "  npm run benchmark:canvas -- --marks=10000 --output=test-results/canvas-benchmark.json",
    "",
    "Options:",
    "  --url=<url>             App URL. Default: http://localhost:8080/",
    "  --marks=<count>         Synthetic mark count. Default: 10000",
    "  --regions=<count>       Number of synthetic mark regions. Default: 100",
    "  --pan-frames=<count>    Frames per synthetic pan scenario. Default: 90",
    "  --fit-sample-ms=<ms>    Fit-world frame sample duration. Default: 900",
    "  --width=<px>            Browser viewport width. Default: 1366",
    "  --height=<px>           Browser viewport height. Default: 768",
    "  --output=<path>         Optional JSON output path.",
    "  --headful               Run Chromium with a visible browser window.",
    "  --help                  Show this help.",
  ].join("\n"));
}

function makeMarks(count, regions) {
  const colors = ["#86a6c9", "#f0b35a", "#d9826b", "#9fc5a8", "#b48ead"];
  const shapes = ["circle", "square", "diamond"];
  const cols = Math.max(1, Math.ceil(Math.sqrt(regions)));
  const marks = [];

  for (let index = 0; index < count; index += 1) {
    const region = index % regions;
    const local = Math.floor(index / regions);
    const regionX = (region % cols) - Math.floor(cols / 2);
    const regionY = Math.floor(region / cols) - Math.floor(cols / 2);
    const baseX = regionX * 15000;
    const baseY = regionY * 15000;
    const x = baseX + ((local % 10) * 72) + ((Math.floor(local / 10) % 5) * 9);
    const y = baseY + ((Math.floor(local / 10) % 10) * 72) + ((local % 5) * 9);

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

async function installBenchmarkHooks(page) {
  await page.evaluate(() => {
    window.__canvasBench = { active: "boot", stats: {}, frames: {} };
    window.__canvasBenchReset = (label) => {
      window.__canvasBench.active = label;
      window.__canvasBench.stats[label] = {};
    };

    const functionNames = [
      "applyCanvasView",
      "renderMarksForViewport",
      "renderMapClusters",
      "currentClusters",
      "renderFogCanvas",
      "renderCanvasTiles",
    ];

    functionNames.forEach((name) => {
      const original = window[name];
      if (typeof original !== "function") {
        return;
      }

      window[name] = function wrappedCanvasBenchFunction(...args) {
        const label = window.__canvasBench.active || "default";
        const stats = window.__canvasBench.stats[label] || (window.__canvasBench.stats[label] = {});
        const item = stats[name] || (stats[name] = { calls: 0, total: 0, max: 0 });
        const startedAt = performance.now();

        try {
          return original.apply(this, args);
        } finally {
          const duration = performance.now() - startedAt;
          item.calls += 1;
          item.total += duration;
          item.max = Math.max(item.max, duration);
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
        resolve();
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
          max: Math.max(...dispatchDurations),
        };
        resolve();
      };

      requestAnimationFrame(step);
    });
  });
}

function summarizeFrames(frames) {
  const sorted = [...frames].sort((a, b) => a - b);
  const percentile = (value) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] || 0;
  const average = frames.reduce((sum, value) => sum + value, 0) / Math.max(1, frames.length);

  return {
    count: frames.length,
    avg: Number(average.toFixed(2)),
    p50: Number(percentile(0.50).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    max: Number(Math.max(0, ...frames).toFixed(2)),
    over16_7: frames.filter((value) => value > 16.7).length,
    over33_3: frames.filter((value) => value > 33.3).length,
  };
}

async function collectBenchmarkResult(page, syncDuration) {
  return page.evaluate((duration) => {
    const summarizeFramesInPage = (frames) => {
      const sorted = [...frames].sort((a, b) => a - b);
      const percentile = (value) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] || 0;
      const average = frames.reduce((sum, item) => sum + item, 0) / Math.max(1, frames.length);

      return {
        count: frames.length,
        avg: Number(average.toFixed(2)),
        p50: Number(percentile(0.50).toFixed(2)),
        p95: Number(percentile(0.95).toFixed(2)),
        max: Number(Math.max(0, ...frames).toFixed(2)),
        over16_7: frames.filter((value) => value > 16.7).length,
        over33_3: frames.filter((value) => value > 33.3).length,
      };
    };
    const canvas = document.querySelector("[data-mark-canvas]");
    const bench = window.__canvasBench;
    const stats = {};
    const frames = {};

    Object.entries(bench.stats).forEach(([label, entries]) => {
      stats[label] = {};
      Object.entries(entries).forEach(([name, item]) => {
        stats[label][name] = {
          calls: item.calls,
          total: Number(item.total.toFixed(2)),
          avg: Number((item.total / Math.max(1, item.calls)).toFixed(2)),
          max: Number(item.max.toFixed(2)),
        };
      });
    });

    Object.entries(bench.frames).forEach(([label, values]) => {
      frames[label] = summarizeFramesInPage(values);
    });

    return {
      syncDuration: Number(duration.toFixed(2)),
      currentState: {
        renderedMarkCount: canvas?.dataset.renderedMarkCount || "",
        totalMarkCount: canvas?.dataset.totalMarkCount || "",
        domMarks: document.querySelectorAll(".mark-dot").length,
        mapClusters: document.querySelectorAll(".map-cluster").length,
        renderMode: canvas?.dataset.renderMode || "",
        heap: performance.memory
          ? {
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize,
            }
          : null,
      },
      stats,
      frames,
    };
  }, syncDuration);
}

async function getCanvasState(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("[data-mark-canvas]");

    return {
      renderedMarkCount: canvas?.dataset.renderedMarkCount || "",
      totalMarkCount: canvas?.dataset.totalMarkCount || "",
      domMarks: document.querySelectorAll(".mark-dot").length,
      mapClusters: document.querySelectorAll(".map-cluster").length,
      renderMode: canvas?.dataset.renderMode || "",
      heap: performance.memory
        ? {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
          }
        : null,
    };
  });
}

async function runBenchmark(options) {
  const browser = await chromium.launch({ headless: !options.headful });
  const page = await browser.newPage({ viewport: { width: options.width, height: options.height } });

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
    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    await installBenchmarkHooks(page);

    const marks = makeMarks(options.marks, options.regions);
    const payload = {
      ok: true,
      count: marks.length,
      marks,
      recent_marks: marks.slice(0, 10),
      mark_uids: marks.map((mark) => mark.uid),
    };

    const syncDuration = await page.evaluate((syncPayload) => {
      window.__canvasBenchReset("sync");
      const startedAt = performance.now();
      window.dispatchEvent(new CustomEvent("test:syncMarks", { detail: syncPayload }));
      return performance.now() - startedAt;
    }, payload);
    const afterSync = await getCanvasState(page);

    await page.evaluate(() => window.__canvasBenchReset("fitWorld"));
    const fitFrames = page.evaluate((durationMs) => window.__canvasBenchSampleFrames("fitWorld", durationMs), options.fitSampleMs);
    await page.getByLabel("Fit whole world").click();
    await fitFrames;
    await page.waitForTimeout(100);
    const afterFitWorld = await getCanvasState(page);

    await page.evaluate((frames) => window.__canvasBenchSyntheticPan("detailPan", 1, 0, 0, 6000, frames), options.panFrames);
    await page.evaluate((frames) => window.__canvasBenchSyntheticPan("mapPan", 0.004, 0, 0, 120000, frames), options.panFrames);

    const result = await collectBenchmarkResult(page, syncDuration);

    return {
      benchmark: "canvas-10k",
      options: {
        url: options.url,
        marks: options.marks,
        regions: options.regions,
        panFrames: options.panFrames,
        fitSampleMs: options.fitSampleMs,
        viewport: { width: options.width, height: options.height },
        headless: !options.headful,
      },
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        browser: "chromium",
        capturedAt: new Date().toISOString(),
      },
      afterSync,
      afterFitWorld,
      ...result,
    };
  } finally {
    await browser.close();
  }
}

function printSummary(result) {
  const lines = [
    `Canvas benchmark (${result.options.marks} marks, ${result.options.regions} regions)`,
    `URL: ${result.options.url}`,
    "",
    `Sync: ${result.syncDuration}ms`,
    `After sync: ${result.afterSync.domMarks} DOM marks / ${result.afterSync.totalMarkCount} total, mode=${result.afterSync.renderMode}`,
    `After fit world: ${result.afterFitWorld.domMarks} DOM marks / ${result.afterFitWorld.totalMarkCount} total, clusters=${result.afterFitWorld.mapClusters}, mode=${result.afterFitWorld.renderMode}`,
    "",
    "Frame summaries:",
  ];

  Object.entries(result.frames).forEach(([label, frame]) => {
    lines.push(`- ${label}: p50=${frame.p50}ms p95=${frame.p95}ms max=${frame.max}ms >16.7=${frame.over16_7}/${frame.count} >33.3=${frame.over33_3}/${frame.count}`);
  });

  lines.push("", "Hot-path timings:");
  Object.entries(result.stats).forEach(([label, entries]) => {
    const apply = entries.applyCanvasView;
    const marks = entries.renderMarksForViewport;
    const clusters = entries.renderMapClusters;
    const current = entries.currentClusters;
    const parts = [];

    if (apply) parts.push(`apply avg=${apply.avg}ms max=${apply.max}ms calls=${apply.calls}`);
    if (marks) parts.push(`marks total=${marks.total}ms avg=${marks.avg}ms calls=${marks.calls}`);
    if (clusters) parts.push(`clusters total=${clusters.total}ms avg=${clusters.avg}ms calls=${clusters.calls}`);
    if (current) parts.push(`currentClusters total=${current.total}ms avg=${current.avg}ms calls=${current.calls}`);

    lines.push(`- ${label}: ${parts.join("; ")}`);
  });

  console.log(lines.join("\n"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const result = await runBenchmark(options);

  printSummary(result);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\nWrote JSON results to ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
