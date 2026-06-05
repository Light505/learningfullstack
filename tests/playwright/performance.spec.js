const { test, expect } = require("@playwright/test");

async function isolateCanvasData(page) {
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
}

function makeBenchmarkMarks(count) {
  const colors = ["#86a6c9", "#f0b35a", "#d9826b", "#9fc5a8", "#b48ead"];
  const shapes = ["circle", "square", "diamond"];
  const regions = 100;
  const cols = 10;

  return Array.from({ length: count }, (_, index) => {
    const region = index % regions;
    const local = Math.floor(index / regions);
    const regionX = (region % cols) - 5;
    const regionY = Math.floor(region / cols) - 5;
    const baseX = regionX * 15000;
    const baseY = regionY * 15000;
    const x = baseX + ((local % 10) * 72) + ((Math.floor(local / 10) % 5) * 9);
    const y = baseY + ((Math.floor(local / 10) % 10) * 72) + ((local % 5) * 9);

    return {
      uid: `perf-${index}`,
      display_name: `Perf ${index}`,
      message: "Performance benchmark mark.",
      drawing: null,
      x_percent: String(x),
      y_percent: String(y),
      color: colors[index % colors.length],
      shape: shapes[index % shapes.length],
      created_at: "2026-06-05 00:00:00",
    };
  });
}

test.describe("large canvas performance safeguards", () => {
  test.setTimeout(90000);

  test("bulk sync renders once and map view keeps hidden clustered marks unmounted", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    const marks = makeBenchmarkMarks(10000);
    const syncState = await page.evaluate((payload) => {
      window.__renderMarksForViewportCalls = 0;
      const originalRenderMarksForViewport = window.renderMarksForViewport;
      window.renderMarksForViewport = function countedRenderMarksForViewport(...args) {
        window.__renderMarksForViewportCalls += 1;
        return originalRenderMarksForViewport.apply(this, args);
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", { detail: payload }));

      return {
        renderCalls: window.__renderMarksForViewportCalls,
        renderedMarkCount: Number.parseInt(document.querySelector("[data-mark-canvas]").dataset.renderedMarkCount || "0", 10),
        totalMarkCount: Number.parseInt(document.querySelector("[data-mark-canvas]").dataset.totalMarkCount || "0", 10),
        domMarks: document.querySelectorAll(".mark-dot").length,
      };
    }, {
      ok: true,
      count: marks.length,
      marks,
      recent_marks: [marks[0]],
      mark_uids: marks.map((mark) => mark.uid),
    });

    expect(syncState.renderCalls).toBeLessThanOrEqual(2);
    expect(syncState.totalMarkCount).toBe(10000);
    expect(syncState.domMarks).toBe(syncState.renderedMarkCount);

    await page.getByLabel("Fit whole world").click();
    await expect(page.locator("[data-mark-canvas]")).toHaveClass(/is-map-view/, { timeout: 9000 });
    await expect(page.locator(".map-cluster").first()).toBeVisible({ timeout: 9000 });

    await page.waitForTimeout(10000);
    await expect.poll(async () => page.evaluate(() => document.querySelectorAll(".mark-dot").length), { timeout: 12000 })
      .toBeLessThan(10000);

    const mapState = await page.evaluate(() => ({
      renderedMarkCount: Number.parseInt(document.querySelector("[data-mark-canvas]").dataset.renderedMarkCount || "0", 10),
      totalMarkCount: Number.parseInt(document.querySelector("[data-mark-canvas]").dataset.totalMarkCount || "0", 10),
      domMarks: document.querySelectorAll(".mark-dot").length,
      clusters: document.querySelectorAll(".map-cluster").length,
    }));

    expect(mapState.totalMarkCount).toBe(10000);
    expect(mapState.clusters).toBeGreaterThan(0);
    expect(mapState.domMarks).toBeLessThan(mapState.totalMarkCount);
    expect(mapState.renderedMarkCount).toBe(mapState.domMarks);

    await page.locator("[data-recent-list]").getByRole("button", { name: /perf 0/i }).click();
    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveAttribute("data-name", "Perf 0", { timeout: 12000 });
    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveCount(1);
  });
});
