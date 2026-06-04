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

async function fitWholeWorld(page) {
  await page.getByLabel("Fit whole world").click();
  await expect.poll(async () => page.locator("[data-canvas-world]").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return matrix.a;
  })).toBeLessThan(0.01);
}

test.describe("responsive app layout", () => {
  test("places recent marks below the main workspace without sidebar scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("http://localhost:8080/");

    const metrics = await page.evaluate(() => ({
      canvasHeight: document.querySelector("[data-mark-canvas]").getBoundingClientRect().height,
      canvasWidth: document.querySelector("[data-mark-canvas]").getBoundingClientRect().width,
      sideBottom: document.querySelector(".side-panel").getBoundingClientRect().bottom,
      recentTop: document.querySelector(".recent-preview").getBoundingClientRect().top,
      canvasBottom: document.querySelector(".canvas-panel").getBoundingClientRect().bottom,
      markCanvasBottom: document.querySelector("[data-mark-canvas]").getBoundingClientRect().bottom,
      sideOverflow: getComputedStyle(document.querySelector(".side-panel")).overflowY,
    }));

    expect(metrics.canvasHeight).toBeGreaterThanOrEqual(520);
    expect(metrics.canvasHeight).toBeLessThanOrEqual(1200);
    expect(Math.abs(metrics.canvasBottom - metrics.markCanvasBottom)).toBeLessThanOrEqual(14);
    expect(metrics.sideOverflow).not.toBe("auto");
    expect(metrics.recentTop).toBeGreaterThanOrEqual(Math.max(metrics.canvasBottom, metrics.sideBottom) + 12);
  });

  test("does not create horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://localhost:8080/");

    const overflow = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const offenders = Array.from(document.querySelectorAll("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: element.className,
            width: rect.width,
            right: rect.right,
          };
        })
        .filter((item) => item.right > viewportWidth + 1 || item.width > viewportWidth + 1)
        .sort((a, b) => b.right - a.right);

      return {
        viewportWidth,
        documentWidth: document.documentElement.scrollWidth,
        offenders: offenders.slice(0, 5),
      };
    });

    expect(overflow.documentWidth, JSON.stringify(overflow.offenders, null, 2)).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  });

  test("canvas note can be hidden", async ({ page }) => {
    await page.goto("http://localhost:8080/");

    const hint = page.locator("[data-canvas-hint]");
    await expect(hint).toBeVisible();
    await page.getByLabel("Hide canvas note").click();
    await expect(hint).toBeHidden();
  });

  test("renders the placement marker where the canvas is clicked", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));
    });
    await page.getByLabel("Hide canvas note").click();

    const canvas = page.locator("[data-mark-canvas]");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const clickPoint = {
      x: box.x + box.width * 0.52,
      y: box.y + box.height * 0.36,
    };
    await page.mouse.click(clickPoint.x, clickPoint.y);

    const markerCenter = await page.locator("[data-placement-marker]").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    });

    expect(Math.abs(markerCenter.x - clickPoint.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(markerCenter.y - clickPoint.y)).toBeLessThanOrEqual(2);
  });

  test("keeps the placement marker anchored while panning the camera", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));
    });
    await page.getByLabel("Hide canvas note").click();

    const canvas = page.locator("[data-mark-canvas]");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.getByLabel("Zoom in").click();
    const beforePan = await page.locator("[data-placement-marker]").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    });

    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5 - 96, box.y + box.height * 0.5 - 64);
    await page.mouse.up();
    await page.keyboard.up("Shift");

    const afterPan = await page.locator("[data-placement-marker]").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    });

    expect(afterPan.x).toBeLessThan(beforePan.x - 40);
    expect(afterPan.y).toBeLessThan(beforePan.y - 24);
  });

  test("rejects placement outside explored canvas tiles", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));
    });
    await page.getByLabel("Hide canvas note").click();

    await page.evaluate(() => {
      const canvas = document.querySelector("[data-mark-canvas]");
      canvas.style.setProperty("--canvas-world-width", "3072px");
      canvas.style.setProperty("--canvas-world-height", "3072px");
      canvas.style.setProperty("--canvas-pan-x", "-1024px");
    });

    const canvas = page.locator("[data-mark-canvas]");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(page.locator("[data-placement-marker]")).toBeVisible();

    await page.evaluate(() => {
      const canvas = document.querySelector("[data-mark-canvas]");
      const click = new MouseEvent("click", {
        bubbles: true,
        button: 0,
        clientX: canvas.getBoundingClientRect().left + (canvas.getBoundingClientRect().width * 1.5),
        clientY: canvas.getBoundingClientRect().top + (canvas.getBoundingClientRect().height * 0.5),
      });
      canvas.dispatchEvent(click);
    });
    await expect(page.locator("[data-placement-marker]")).toBeHidden();
    await expect(page.locator("[data-submit-button]")).toBeDisabled();
    await expect(page.locator("[data-placement-note]")).toContainText("inside the available canvas");
  });

  test("uses normal scrolling on narrow screens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://localhost:8080/");

    await expect(page.locator("[data-mark-canvas]")).toBeVisible();
    await expect(page.locator("[data-mark-form]")).toBeVisible();

    const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflowY);
    expect(bodyOverflow).not.toBe("hidden");
  });

  test("shows a toast for newly synced marks", async ({ page }) => {
    await page.goto("http://localhost:8080/");

    await page.evaluate(() => {
      window.__testToastMark = {
        uid: `toast-${Date.now()}`,
        display_name: "Toast Test",
        message: "A new mark appeared.",
        drawing: null,
        x_percent: "11.00",
        y_percent: "22.00",
        color: "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };
    });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));
      const payload = {
        ok: true,
        count: 1,
        marks: [window.__testToastMark],
        mark_uids: [window.__testToastMark.uid],
      };
      window.dispatchEvent(new CustomEvent("test:syncMarks", { detail: payload }));
    });

    await expect(page.locator(".mark-toast", { hasText: "Toast Test left a mark" }).first()).toBeVisible();
  });

  test("recent marks can focus and select their canvas mark", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    await page.evaluate(() => {
      const mark = {
        uid: `recent-focus-${Date.now()}`,
        display_name: "Recent Focus",
        message: "Find me from the list.",
        drawing: null,
        x_percent: "45.00",
        y_percent: "55.00",
        color: "#9fc5a8",
        shape: "square",
        created_at: "2026-05-29 14:00:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 1,
          marks: [mark],
          mark_uids: [mark.uid],
        },
      }));
    });

    await page.locator("[data-recent-list]").getByRole("button", { name: /recent focus/i }).click();

    await expect(page.locator("[data-preview-name]")).toHaveText("Recent Focus");
    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveAttribute("data-name", "Recent Focus");
    await expect(page.locator("[data-mark-popout]")).toBeVisible();

    const canvas = page.locator("[data-mark-canvas]");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 - 40);
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect(page.locator("[data-mark-popout]")).toBeVisible();
  });

  test("selected mark popup adapts while zooming out", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        ["Solo Zoom", 0, 0],
        ["Cluster Anchor", 5000, 0],
        ["Cluster Mate", 5080, 80],
      ].map(([name, x, y], index) => ({
        uid: `popup-zoom-${index}-${now}`,
        display_name: name,
        message: "Popup zoom probe.",
        drawing: null,
        x_percent: String(x),
        y_percent: String(y),
        color: index === 0 ? "#9fc5a8" : "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      }));

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: marks,
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    await page.evaluate(() => {
      const canvas = document.querySelector("[data-mark-canvas]");
      const rect = canvas.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent("test:setCanvasView", {
        detail: { zoom: 1, panX: (rect.width / 2) - 102400, panY: (rect.height / 2) - 102400, clamp: false },
      }));
    });
    await page.locator(".mark-dot[data-name='Solo Zoom']").click();
    await expect(page.locator("[data-mark-popout]")).toBeVisible();

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:setCanvasView", {
        detail: { zoom: 1.2, panX: -103400, panY: -102000, clamp: false },
      }));
    });
    await expect(page.locator("[data-mark-popout]")).toHaveAttribute("data-state", "compact");
    await expect(page.locator("[data-mark-popout] h2")).toBeHidden();
    const compactPosition = await page.evaluate(() => {
      const canvasRect = document.querySelector("[data-mark-canvas]").getBoundingClientRect();
      const popoutRect = document.querySelector("[data-mark-popout]").getBoundingClientRect();
      return {
        edgeDelta: Math.min(
          Math.abs(popoutRect.left - canvasRect.left),
          Math.abs(popoutRect.right - canvasRect.right),
        ),
        width: popoutRect.width,
      };
    });
    expect(compactPosition.edgeDelta).toBeLessThan(12);
    expect(compactPosition.width).toBeLessThan(60);

    await page.locator("[data-mark-popout]").click();
    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveAttribute("data-name", "Solo Zoom", { timeout: 8000 });
    await expect(page.locator("[data-mark-popout]")).toHaveAttribute("data-state", "full");

    await page.getByLabel("Fit whole world").click();
    await expect(page.locator("[data-mark-popout]")).toBeVisible();
    await expect(page.locator("[data-mark-popout]")).toHaveAttribute("data-state", "compact");

    await page.evaluate(() => {
      const canvas = document.querySelector("[data-mark-canvas]");
      const rect = canvas.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent("test:setCanvasView", {
        detail: { zoom: 1, panX: (rect.width / 2) - 107400, panY: (rect.height / 2) - 102400, clamp: false },
      }));
    });
    await page.evaluate(() => {
      document.querySelector(".mark-dot[data-name='Cluster Anchor']").click();
    });
    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveAttribute("data-name", "Cluster Anchor", { timeout: 8000 });
    await page.evaluate(() => {
      const canvas = document.querySelector("[data-mark-canvas]");
      const world = document.querySelector("[data-canvas-world]");
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(world);
      const worldWidth = Number.parseFloat(style.getPropertyValue("--canvas-world-width"));
      const worldHeight = Number.parseFloat(style.getPropertyValue("--canvas-world-height"));
      const padding = 36;
      const zoom = Math.min(1, Math.max(1, rect.width - (padding * 2)) / worldWidth, Math.max(1, rect.height - (padding * 2)) / worldHeight);
      window.dispatchEvent(new CustomEvent("test:setCanvasView", {
        detail: {
          zoom,
          panX: (rect.width - (worldWidth * zoom)) / 2,
          panY: (rect.height - (worldHeight * zoom)) / 2,
          clamp: false,
        },
      }));
    });

    await expect(page.locator("[data-mark-popout]")).toBeHidden();
    await expect(page.locator(".map-cluster[data-selected-cluster='true']")).toBeVisible();
  });

  test("supports bounded keyboard-modified pan and zoom controls", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));
    });

    const canvas = page.locator("[data-mark-canvas]");
    const world = page.locator("[data-canvas-world]");

    await page.getByLabel("Zoom in").click();
    await expect(world).toHaveCSS("transform", /matrix\(1\.2/);
    await expect(page.getByLabel("Canvas zoom level")).toHaveText("120%");

    const beforePan = await world.evaluate((element) => getComputedStyle(element).transform);
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 80);
    await page.mouse.up();
    await page.keyboard.up("Shift");

    const afterPan = await world.evaluate((element) => getComputedStyle(element).transform);
    expect(afterPan).not.toBe(beforePan);

    await page.getByLabel("Reset canvas view").click();
    const resetTransform = await world.evaluate((element) => getComputedStyle(element).transform);
    expect(resetTransform).not.toBe(afterPan);
    expect(resetTransform).toContain("matrix(1, 0, 0, 1");
    await expect(page.getByLabel("Canvas zoom level")).toHaveText("100%");
  });

  test("supports keyboard zoom shortcuts and bounded controls", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const farMark = {
        uid: `keyboard-zoom-${Date.now()}`,
        display_name: "Keyboard Zoom",
        message: "Far out.",
        drawing: null,
        x_percent: "50000.00",
        y_percent: "50000.00",
        color: "#86a6c9",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 1, marks: [farMark], mark_uids: [farMark.uid] },
      }));
    });

    const world = page.locator("[data-canvas-world]");
    await page.keyboard.press("=");
    await expect(world).toHaveCSS("transform", /matrix\(1\.2/);
    await expect(page.getByLabel("Canvas zoom level")).toHaveText("120%");

    await page.keyboard.press("-");
    await expect.poll(async () => page.getByLabel("Canvas zoom level").textContent()).toBe("100%");

    await page.keyboard.press("f");
    await expect(page.getByLabel("Export whole world")).toBeVisible();
    await expect.poll(async () => page.getByLabel("Canvas zoom level").textContent()).not.toBe("100%");

    await expect(page.getByLabel("Zoom out")).toBeDisabled();

    await page.keyboard.press("0");
    await expect.poll(async () => page.getByLabel("Canvas zoom level").textContent()).toBe("100%");
    await expect(page.getByLabel("Zoom out")).toBeEnabled();
  });

  test("steps through tile and world-view stops before fitting the whole world", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const farMark = {
        uid: `world-stop-${Date.now()}`,
        display_name: "World Stop",
        message: "Far enough to need world-view steps.",
        drawing: null,
        x_percent: "50000.00",
        y_percent: "50000.00",
        color: "#86a6c9",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 1, marks: [farMark], mark_uids: [farMark.uid] },
      }));
    });

    const canvas = page.locator("[data-mark-canvas]");
    const world = page.locator("[data-canvas-world]");
    const expectedStops = await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const worldWidth = Number.parseFloat(getComputedStyle(element).getPropertyValue("--canvas-world-width"));
      const worldHeight = Number.parseFloat(getComputedStyle(element).getPropertyValue("--canvas-world-height"));
      const tileSize = 1024;
      const padding = 36;
      const fitZoom = Math.min(
        1,
        Math.max(1, rect.width - (padding * 2)) / worldWidth,
        Math.max(1, rect.height - (padding * 2)) / worldHeight,
      );
      const tileZoomForCount = (tileCount) => Math.min(rect.width, rect.height) / (tileCount * tileSize);
      const overviewBoundaryZoom = Math.max(fitZoom / 0.25, tileZoomForCount(25));
      const tileStops = [3, 7, 13]
        .map(tileZoomForCount)
        .filter((zoom) => zoom > overviewBoundaryZoom + 0.001);
      const clusterVisualCollisionPx = 72;
      const clusterStops = [
        [tileSize * 16, 1.592],
        [tileSize * 6, 1.536],
        [tileSize * 2, 1.422],
        [tileSize * 0.55, 1.328],
      ].map(([radius, multiplier]) => Number(((clusterVisualCollisionPx / radius) * multiplier).toFixed(4)));

      return [...clusterStops, ...tileStops, overviewBoundaryZoom, fitZoom / 0.5, fitZoom]
        .map((zoom) => Math.max(fitZoom, Math.min(2.4, Number(zoom.toFixed(3)))))
        .filter((zoom, index, stops) => stops.findIndex((item) => Math.abs(item - zoom) <= 0.0015) === index)
        .sort((a, b) => b - a);
    });

    expect(expectedStops.length).toBeGreaterThanOrEqual(3);

    for (const expectedZoom of expectedStops) {
      await page.keyboard.press("-");
      await expect.poll(async () => world.evaluate((element) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        return matrix.a;
      })).toBeCloseTo(expectedZoom, 3);
    }

    await expect(page.getByLabel("Zoom out")).toBeDisabled();

    for (const expectedZoom of expectedStops.slice(0, -1).reverse()) {
      await page.keyboard.press("=");
      await expect.poll(async () => world.evaluate((element) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        return matrix.a;
      })).toBeCloseTo(expectedZoom, 3);
    }

    await page.keyboard.press("=");
    await expect.poll(async () => page.getByLabel("Canvas zoom level").textContent()).toBe("100%");
  });

  test("fits the whole current world for map navigation", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const farMark = {
        uid: `far-map-${Date.now()}`,
        display_name: "Far Map",
        message: "Far away.",
        drawing: null,
        x_percent: "50000.00",
        y_percent: "50000.00",
        color: "#86a6c9",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 1,
          marks: [farMark],
          mark_uids: [farMark.uid],
        },
      }));
    });

    await page.getByLabel("Fit whole world").click();

    await expect.poll(async () => page.locator("[data-canvas-world]").evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      const canvas = document.querySelector("[data-mark-canvas]");

      return {
        zoom: matrix.a,
        isMapView: canvas.classList.contains("is-map-view"),
      };
    })).toMatchObject({
      isMapView: true,
    });

    const fitState = await page.locator("[data-canvas-world]").evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);

      return { zoom: matrix.a };
    });
    expect(fitState.zoom).toBeLessThan(1);

    const renderedTileCount = await page.locator(".canvas-tile").count();
    expect(renderedTileCount).toBeLessThan(80);
  });

  test("renders fog as a bounded overlay in whole-map view", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const farMark = {
        uid: `fog-map-${Date.now()}`,
        display_name: "Fog Map",
        message: "Expands map.",
        drawing: null,
        x_percent: "50000.00",
        y_percent: "50000.00",
        color: "#9fc5a8",
        shape: "circle",
        created_at: "just now",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 1,
          marks: [farMark],
          recent_marks: [farMark],
          mark_uids: [farMark.uid],
        },
      }));
    });

    await fitWholeWorld(page);
    await expect.poll(async () => page.locator("[data-fog-canvas]").evaluate((element) => {
      return Number.parseFloat(getComputedStyle(element).opacity);
    })).toBeGreaterThan(0.8);

    const fogState = await page.evaluate(() => {
      const canvas = document.querySelector("[data-mark-canvas]");
      const fog = document.querySelector("[data-fog-canvas]");
      const context = fog.getContext("2d");
      const world = document.querySelector("[data-canvas-world]");
      const style = getComputedStyle(world);
      const worldWidth = Number.parseFloat(style.getPropertyValue("--canvas-world-width"));
      const worldHeight = Number.parseFloat(style.getPropertyValue("--canvas-world-height"));
      const minX = -102400;
      const minY = -102400;
      const scaleX = fog.width / worldWidth;
      const scaleY = fog.height / worldHeight;
      const alphaAt = (x, y) => {
        const pixelX = Math.max(0, Math.min(fog.width - 1, Math.round((x - minX) * scaleX)));
        const pixelY = Math.max(0, Math.min(fog.height - 1, Math.round((y - minY) * scaleY)));

        return context.getImageData(pixelX, pixelY, 1, 1).data[3];
      };

      return {
        renderMode: canvas.dataset.renderMode,
        fogWidth: fog.width,
        fogHeight: fog.height,
        fogOpacity: Number.parseFloat(getComputedStyle(fog).opacity),
        exploredAlpha: alphaAt(512, 512),
        unexploredAlpha: alphaAt(-90000, -90000),
      };
    });

    expect(fogState.renderMode).toBe("map");
    expect(fogState.fogWidth).toBeLessThanOrEqual(4096);
    expect(fogState.fogHeight).toBeLessThanOrEqual(4096);
    expect(fogState.fogOpacity).toBeGreaterThan(0.8);
    expect(fogState.unexploredAlpha).toBeGreaterThan(fogState.exploredAlpha + 80);
  });

  test("toggles fit world back to the previous camera view", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const mark = {
        uid: `fit-toggle-${Date.now()}`,
        display_name: "Fit Toggle",
        message: "Far enough.",
        drawing: null,
        x_percent: "50000.00",
        y_percent: "50000.00",
        color: "#86a6c9",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 1, marks: [mark], mark_uids: [mark.uid] },
      }));
    });

    const world = page.locator("[data-canvas-world]");
    await page.getByLabel("Zoom in").click();
    await expect(world).toHaveCSS("transform", /matrix\(1\.2/);
    const beforeFit = await world.evaluate((element) => getComputedStyle(element).transform);

    await page.getByLabel("Fit whole world").click();
    await expect(page.getByLabel("Export whole world")).toBeVisible();
    await expect.poll(async () => world.evaluate((element) => getComputedStyle(element).transform)).not.toBe(beforeFit);

    await page.getByLabel("Fit whole world").click();
    await expect(page.getByLabel("Export whole world")).toBeHidden();
    await expect.poll(async () => world.evaluate((element) => getComputedStyle(element).transform)).toBe(beforeFit);
  });

  test("wheel zooms the canvas without scrolling the page", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    const canvas = page.locator("[data-mark-canvas]");
    const world = page.locator("[data-canvas-world]");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -320);

    await expect(world).toHaveCSS("transform", /matrix\(1\.2/);
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test("keeps the mouse position anchored while wheel zooming out", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const farMark = {
        uid: `wheel-anchor-${Date.now()}`,
        display_name: "Wheel Anchor",
        message: "Far enough for a large world.",
        drawing: null,
        x_percent: "50000.00",
        y_percent: "50000.00",
        color: "#86a6c9",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 1, marks: [farMark], mark_uids: [farMark.uid] },
      }));
    });

    const canvas = page.locator("[data-mark-canvas]");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const pointer = {
      x: box.x + (box.width * 0.72),
      y: box.y + (box.height * 0.42),
    };
    await page.mouse.move(pointer.x, pointer.y);

    const before = await page.evaluate((pointer) => {
      const canvas = document.querySelector("[data-mark-canvas]");
      const world = document.querySelector("[data-canvas-world]");
      const rect = canvas.getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform);

      return {
        x: (pointer.x - rect.left - matrix.m41) / matrix.a,
        y: (pointer.y - rect.top - matrix.m42) / matrix.a,
      };
    }, pointer);

    await page.mouse.wheel(0, 320);
    await page.waitForTimeout(420);

    const after = await page.evaluate((pointer) => {
      const canvas = document.querySelector("[data-mark-canvas]");
      const world = document.querySelector("[data-canvas-world]");
      const rect = canvas.getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform);

      return {
        x: (pointer.x - rect.left - matrix.m41) / matrix.a,
        y: (pointer.y - rect.top - matrix.m42) / matrix.a,
      };
    }, pointer);

    expect(Math.abs(after.x - before.x)).toBeLessThan(4);
    expect(Math.abs(after.y - before.y)).toBeLessThan(4);
  });

  test("centers the whole world at the final wheel zoom-out stop", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const farMark = {
        uid: `wheel-fit-${Date.now()}`,
        display_name: "Wheel Fit",
        message: "Far enough for final fit.",
        drawing: null,
        x_percent: "50000.00",
        y_percent: "50000.00",
        color: "#86a6c9",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 1, marks: [farMark], mark_uids: [farMark.uid] },
      }));
    });

    const canvas = page.locator("[data-mark-canvas]");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + (box.width * 0.75), box.y + (box.height * 0.35));

    for (let index = 0; index < 12; index += 1) {
      if (await page.getByLabel("Zoom out").isDisabled()) {
        break;
      }
      await page.mouse.wheel(0, 320);
      await page.waitForTimeout(340);
    }

    const fitState = await canvas.evaluate((element) => {
      const world = document.querySelector("[data-canvas-world]");
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const worldWidth = Number.parseFloat(style.getPropertyValue("--canvas-world-width"));
      const worldHeight = Number.parseFloat(style.getPropertyValue("--canvas-world-height"));
      const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform);

      return {
        zoom: matrix.a,
        panX: matrix.m41,
        panY: matrix.m42,
        expectedPanX: (rect.width - (worldWidth * matrix.a)) / 2,
        expectedPanY: (rect.height - (worldHeight * matrix.a)) / 2,
      };
    });

    expect(fitState.panX).toBeCloseTo(fitState.expectedPanX, 1);
    expect(fitState.panY).toBeCloseTo(fitState.expectedPanY, 1);
    await expect(page.getByLabel("Zoom out")).toBeDisabled();
  });

  test("clusters dense marks while zoomed out in map mode", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const marks = [
        {
          uid: `cluster-a-${Date.now()}`,
          display_name: "Cluster A",
          message: "Near one.",
          drawing: null,
          x_percent: "100.00",
          y_percent: "120.00",
          color: "#86a6c9",
          shape: "circle",
          created_at: "2026-05-29 14:00:00",
        },
        {
          uid: `cluster-b-${Date.now()}`,
          display_name: "Cluster B",
          message: "Near two.",
          drawing: null,
          x_percent: "130.00",
          y_percent: "150.00",
          color: "#f0b35a",
          shape: "square",
          created_at: "2026-05-29 14:01:00",
        },
        {
          uid: `cluster-far-${Date.now()}`,
          display_name: "Cluster Far",
          message: "Expands map.",
          drawing: null,
          x_percent: "50000.00",
          y_percent: "50000.00",
          color: "#9fc5a8",
          shape: "diamond",
          created_at: "2026-05-29 14:02:00",
        },
      ];

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: marks,
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    await expect(page.locator("[data-mark-canvas]")).not.toHaveClass(/is-map-view/);
    await expect(page.locator(".map-cluster")).toHaveCount(0);
    await expect(page.locator(".mark-dot").first()).toHaveCSS("opacity", "1");

    await page.getByLabel("Fit whole world").click();
    await expect(page.locator("[data-mark-canvas]")).toHaveClass(/is-map-view/);
    await expect(page.locator(".mark-dot").first()).toHaveCSS("opacity", "0");
    await expect(page.locator(".map-cluster", { hasText: "2" })).toBeVisible();

    const beforeClick = await page.locator("[data-canvas-world]").evaluate((element) => getComputedStyle(element).transform);
    await page.locator(".map-cluster", { hasText: "2" }).click();
    await expect.poll(async () => page.locator("[data-canvas-world]").evaluate((element) => getComputedStyle(element).transform)).not.toBe(beforeClick);
  });

  test("opening one supercluster keeps sibling clusters visible at the opened zoom level", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        ["one-galaxy-a-system-1-neighbor-1a", 0, 0],
        ["one-galaxy-a-system-1-neighbor-1b", 80, 80],
        ["one-galaxy-a-system-1-neighbor-2a", 1200, 0],
        ["one-galaxy-a-system-1-neighbor-2b", 1280, 80],
        ["one-galaxy-a-system-2-neighbor-1a", 3600, 0],
        ["one-galaxy-a-system-2-neighbor-1b", 3680, 80],
        ["one-galaxy-a-system-2-neighbor-2a", 4800, 0],
        ["one-galaxy-a-system-2-neighbor-2b", 4880, 80],
        ["one-galaxy-b-system-1-neighbor-1a", 11000, 0],
        ["one-galaxy-b-system-1-neighbor-1b", 11080, 80],
        ["one-galaxy-b-system-1-neighbor-2a", 12200, 0],
        ["one-galaxy-b-system-1-neighbor-2b", 12280, 80],
        ["one-galaxy-b-system-2-neighbor-1a", 14600, 0],
        ["one-galaxy-b-system-2-neighbor-1b", 14680, 80],
        ["one-galaxy-b-system-2-neighbor-2a", 15800, 0],
        ["one-galaxy-b-system-2-neighbor-2b", 15880, 80],
        ["two-galaxy-a-system-1-neighbor-1a", 70000, 0],
        ["two-galaxy-a-system-1-neighbor-1b", 70080, 80],
        ["two-galaxy-a-system-1-neighbor-2a", 71200, 0],
        ["two-galaxy-a-system-1-neighbor-2b", 71280, 80],
        ["two-galaxy-a-system-2-neighbor-1a", 73600, 0],
        ["two-galaxy-a-system-2-neighbor-1b", 73680, 80],
        ["two-galaxy-a-system-2-neighbor-2a", 74800, 0],
        ["two-galaxy-a-system-2-neighbor-2b", 74880, 80],
        ["two-galaxy-b-system-1-neighbor-1a", 81000, 0],
        ["two-galaxy-b-system-1-neighbor-1b", 81080, 80],
        ["two-galaxy-b-system-1-neighbor-2a", 82200, 0],
        ["two-galaxy-b-system-1-neighbor-2b", 82280, 80],
        ["two-galaxy-b-system-2-neighbor-1a", 84600, 0],
        ["two-galaxy-b-system-2-neighbor-1b", 84680, 80],
        ["two-galaxy-b-system-2-neighbor-2a", 85800, 0],
        ["two-galaxy-b-system-2-neighbor-2b", 85880, 80],
      ].map(([name, x, y], index) => ({
        uid: `${name}-${now}`,
        display_name: name,
        message: "Cluster path test.",
        drawing: null,
        x_percent: String(x),
        y_percent: String(y),
        color: index % 2 === 0 ? "#86a6c9" : "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      }));

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: marks,
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    await page.getByLabel("Fit whole world").click();
    await expect(page.locator(".map-cluster[data-cluster-level='supercluster']")).toHaveCount(2);

    await page.locator(".map-cluster[data-cluster-level='supercluster']").first().click();
    await expect.poll(async () => page.locator(".map-cluster[data-cluster-level='galaxy']").count()).toBeGreaterThanOrEqual(4);

    const clusterVisibility = await page.locator("[data-mark-canvas]").evaluate((canvasElement) => {
      const canvasRect = canvasElement.getBoundingClientRect();
      return Array.from(document.querySelectorAll(".map-cluster[data-cluster-level='galaxy']")).map((cluster) => {
        const rect = cluster.getBoundingClientRect();
        const overlaps = rect.right > canvasRect.left
          && rect.left < canvasRect.right
          && rect.bottom > canvasRect.top
          && rect.top < canvasRect.bottom;
        return {
          overlaps,
          left: rect.left >= canvasRect.left,
          right: rect.right <= canvasRect.right,
          top: rect.top >= canvasRect.top,
          bottom: rect.bottom <= canvasRect.bottom,
        };
      });
    });
    const visibleClusters = clusterVisibility.filter((item) => item.overlaps);
    expect(visibleClusters.length).toBeGreaterThanOrEqual(2);
    expect(visibleClusters.every((item) => item.left && item.right && item.top && item.bottom)).toBe(true);
  });

  test("does not promote lone child clusters into redundant parent levels", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        ["system-a-neighbor-1a", 0, 0],
        ["system-a-neighbor-1b", 80, 80],
        ["system-a-neighbor-2a", 1200, 0],
        ["system-a-neighbor-2b", 1280, 80],
        ["system-b-neighbor-1a", 3600, 0],
        ["system-b-neighbor-1b", 3680, 80],
        ["system-b-neighbor-2a", 4800, 0],
        ["system-b-neighbor-2b", 4880, 80],
        ["far-world", 70000, 70000],
      ].map(([name, x, y], index) => ({
        uid: `lone-parent-${name}-${now}`,
        display_name: name,
        message: "Lone parent promotion probe.",
        drawing: null,
        x_percent: String(x),
        y_percent: String(y),
        color: index % 2 === 0 ? "#86a6c9" : "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      }));

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: marks,
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    await page.getByLabel("Fit whole world").click();
    await expect(page.locator(".map-cluster[data-cluster-level='supercluster']")).toHaveCount(0);
    await expect(page.locator(".map-cluster[data-cluster-level='galaxy']")).toHaveCount(1);
  });

  test("does not promote a lone system into a galaxy", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        ["neighbor-1a", 0, 0],
        ["neighbor-1b", 80, 80],
        ["neighbor-2a", 1200, 0],
        ["neighbor-2b", 1280, 80],
      ].map(([name, x, y], index) => ({
        uid: `lone-system-${name}-${now}`,
        display_name: name,
        message: "Lone system promotion probe.",
        drawing: null,
        x_percent: String(x),
        y_percent: String(y),
        color: index % 2 === 0 ? "#86a6c9" : "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      }));

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: marks,
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    await page.getByLabel("Fit whole world").click();
    await expect(page.locator(".map-cluster[data-cluster-level='supercluster']")).toHaveCount(0);
    await expect(page.locator(".map-cluster[data-cluster-level='galaxy']")).toHaveCount(0);
    await expect(page.locator(".map-cluster[data-cluster-level='system']")).toHaveCount(1);
  });

  test("absorbs lone marks into eligible cluster levels while leaving far marks individual", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        ["system-neighbor-1a", 0, 0],
        ["system-neighbor-1b", 80, 80],
        ["system-neighbor-2a", 1200, 0],
        ["system-neighbor-2b", 1280, 80],
        ["system-lone", 640, 1500],
        ["galaxy-system-a-1", 20000, 0],
        ["galaxy-system-a-2", 20080, 80],
        ["galaxy-system-a-3", 21200, 0],
        ["galaxy-system-a-4", 21280, 80],
        ["galaxy-system-b-1", 23600, 0],
        ["galaxy-system-b-2", 23680, 80],
        ["galaxy-system-b-3", 24800, 0],
        ["galaxy-system-b-4", 24880, 80],
        ["galaxy-lone", 22440, 5000],
        ["far-lone", 70000, 70000],
      ].map(([name, x, y], index) => ({
        uid: `absorb-${name}-${now}`,
        display_name: name,
        message: "Absorption probe.",
        drawing: null,
        x_percent: String(x),
        y_percent: String(y),
        color: index % 2 === 0 ? "#86a6c9" : "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      }));

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: marks,
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    await page.getByLabel("Fit whole world").click();
    await expect(page.locator(".map-cluster[data-cluster-level='galaxy']", { hasText: "9" })).toBeVisible();
    await expect(page.locator(".map-cluster[data-cluster-level='system']", { hasText: "5" })).toBeVisible();
    const visibleClusterCounts = await page.locator(".map-cluster").evaluateAll((clusters) => (
      clusters.map((cluster) => Number.parseInt(cluster.dataset.count || "0", 10))
    ));
    expect(visibleClusterCounts.reduce((total, count) => total + count, 0)).toBe(14);

    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press("=");
      await page.waitForTimeout(260);
      if (await page.locator(".map-cluster[data-cluster-level='system']", { hasText: "5" }).count() > 0) {
        break;
      }
    }

    await expect(page.locator(".map-cluster[data-cluster-level='system']", { hasText: "5" })).toBeVisible();
  });

  test("clicking a system cluster stops at neighbor bubbles and neighbor open stays capped", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        ["neighbor-1a", 0, 0],
        ["neighbor-1b", 80, 80],
        ["neighbor-2a", 1200, 0],
        ["neighbor-2b", 1280, 80],
      ].map(([name, x, y], index) => ({
        uid: `system-click-${name}-${now}`,
        display_name: name,
        message: "System click endpoint probe.",
        drawing: null,
        x_percent: String(x),
        y_percent: String(y),
        color: index % 2 === 0 ? "#86a6c9" : "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      }));

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: marks,
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    await page.getByLabel("Fit whole world").click();
    await page.locator(".map-cluster[data-cluster-level='system']").click();
    await expect.poll(async () => page.locator(".map-cluster[data-cluster-level='neighbor']").count()).toBe(2);
    await expect(page.locator(".map-cluster[data-cluster-level='system']")).toHaveCount(0);
    await expect(page.locator(".mark-dot.is-clustered")).toHaveCount(4);

    await page.locator(".map-cluster[data-cluster-level='neighbor']").first().click();
    await expect(page.locator(".map-cluster[data-cluster-level='neighbor']")).toHaveCount(0);
    await expect.poll(async () => page.locator("[data-canvas-world]").evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return matrix.a;
    })).toBeLessThanOrEqual(1.205);
  });

  test("plays cluster coalescing once per committed zoom level", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        ["a", 0, 0],
        ["b", 80, 80],
        ["c", 3000, 0],
        ["d", 3080, 80],
        ["e", 11000, 0],
        ["f", 11080, 80],
        ["g", 14000, 0],
        ["h", 14080, 80],
      ].map(([name, x, y], index) => ({
        uid: `animation-${name}-${now}`,
        display_name: name,
        message: "Animation probe.",
        drawing: null,
        x_percent: String(x),
        y_percent: String(y),
        color: index % 2 === 0 ? "#86a6c9" : "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      }));

      window.__clusterAnimationEvents = [];
      document.addEventListener("animationstart", (event) => {
        if (event.animationName === "cluster-coalesce" && event.target.classList?.contains("map-cluster")) {
          window.__clusterAnimationEvents.push({
            level: event.target.dataset.clusterLevel,
            timeBucket: Math.round(performance.now() / 100),
          });
        }
      }, true);

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: marks,
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press("-");
      await page.waitForTimeout(260);
    }
    await page.waitForTimeout(700);

    const batchCountsByLevel = await page.evaluate(() => {
      const groups = window.__clusterAnimationEvents.reduce((items, event) => {
        items[event.level] = items[event.level] || [];
        if (!items[event.level].includes(event.timeBucket)) {
          items[event.level].push(event.timeBucket);
        }
        return items;
      }, {});
      return Object.fromEntries(Object.entries(groups).map(([level, batches]) => [level, batches.length]));
    });
    Object.values(batchCountsByLevel).forEach((batchCount) => {
      expect(batchCount).toBeLessThanOrEqual(1);
    });
  });

  test("zooming in explodes child clusters instead of popping them in", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        ["system-a-1", 0, 0],
        ["system-a-2", 80, 80],
        ["system-b-1", 1200, 0],
        ["system-b-2", 1280, 80],
        ["system-c-1", 3600, 0],
        ["system-c-2", 3680, 80],
        ["system-d-1", 4800, 0],
        ["system-d-2", 4880, 80],
        ["far-world", 50000, 50000],
      ].map(([name, x, y], index) => ({
        uid: `zoom-explode-${name}-${now}`,
        display_name: name,
        message: "Zoom explode probe.",
        drawing: null,
        x_percent: String(x),
        y_percent: String(y),
        color: index % 2 === 0 ? "#86a6c9" : "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      }));

      window.__clusterExplodeEvents = [];
      document.addEventListener("animationstart", (event) => {
        if (event.animationName === "cluster-coalesce"
          && event.target.classList?.contains("map-cluster")
          && document.querySelector("[data-mark-canvas]")?.dataset.clusterTransition === "explode") {
          window.__clusterExplodeEvents.push({
            level: event.target.dataset.clusterLevel,
            x: getComputedStyle(event.target).getPropertyValue("--cluster-expand-x"),
            y: getComputedStyle(event.target).getPropertyValue("--cluster-expand-y"),
          });
        }
      }, true);

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: marks,
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press("-");
      await page.waitForTimeout(260);
      if (await page.locator(".map-cluster[data-cluster-level='system']").count() > 0) {
        break;
      }
    }
    await expect(page.locator(".map-cluster[data-cluster-level='system']").first()).toBeVisible();
    await page.evaluate(() => { window.__clusterExplodeEvents = []; });

    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press("=");
      await page.waitForTimeout(260);
      if (await page.locator(".map-cluster[data-cluster-level='neighbor']").count() >= 2) {
        break;
      }
    }
    await expect.poll(async () => page.locator(".map-cluster[data-cluster-level='neighbor']").count()).toBeGreaterThanOrEqual(2);

    await expect.poll(async () => page.evaluate(() => (
      window.__clusterExplodeEvents.some((event) => event.level === "neighbor")
    ))).toBe(true);
    const explodeEvents = await page.evaluate(() => window.__clusterExplodeEvents);
    expect(explodeEvents.some((event) => event.level === "neighbor")).toBe(true);
    expect(explodeEvents.some((event) => event.x.trim() !== "0px" || event.y.trim() !== "0px")).toBe(true);
  });

  test("recent mark focus opens visible containing clusters before focusing the mark", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        ["recent-target", 0, 0],
        ["target-neighbor", 80, 80],
        ["target-system-neighbor", 1200, 0],
        ["target-system-neighbor-mate", 1280, 80],
        ["target-galaxy-system-a", 3600, 0],
        ["target-galaxy-system-a-mate", 3680, 80],
        ["target-galaxy-system-b", 4800, 0],
        ["target-galaxy-system-b-mate", 4880, 80],
        ["target-super-galaxy-a", 11000, 0],
        ["target-super-galaxy-a-mate", 11080, 80],
        ["target-super-galaxy-b", 12200, 0],
        ["target-super-galaxy-b-mate", 12280, 80],
        ["target-super-galaxy-system-a", 14600, 0],
        ["target-super-galaxy-system-a-mate", 14680, 80],
        ["target-super-galaxy-system-b", 15800, 0],
        ["target-super-galaxy-system-b-mate", 15880, 80],
        ["other-super-galaxy-a", 70000, 0],
        ["other-super-galaxy-a-mate", 70080, 80],
        ["other-super-galaxy-b", 71200, 0],
        ["other-super-galaxy-b-mate", 71280, 80],
      ].map(([name, x, y], index) => ({
        uid: `recent-sequence-${name}-${now}`,
        display_name: name,
        message: "Recent sequence probe.",
        drawing: null,
        x_percent: String(x),
        y_percent: String(y),
        color: index % 2 === 0 ? "#86a6c9" : "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      }));

      window.__recentClusterEvents = [];
      document.addEventListener("animationstart", (event) => {
        if (event.animationName === "cluster-coalesce"
          && event.target.classList?.contains("map-cluster")
          && document.querySelector("[data-mark-canvas]")?.dataset.clusterTransition === "explode") {
          window.__recentClusterEvents.push(event.target.dataset.clusterLevel);
        }
      }, true);

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: [marks[0]],
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    await page.getByLabel("Fit whole world").click();
    await expect(page.locator(".map-cluster").first()).toBeVisible();
    await page.waitForTimeout(900);
    await page.locator("[data-recent-list]").getByRole("button", { name: /recent-target/i }).click();

    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveAttribute("data-name", "recent-target", { timeout: 8000 });
    const recentEvents = await page.evaluate(() => window.__recentClusterEvents);
    expect(recentEvents.length).toBeGreaterThan(0);
    expect(recentEvents).toContain("galaxy");
    expect(recentEvents).toContain("system");
  });

  test("recent mark focus traverses shared cluster ancestry instead of jumping to world view", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        ["current-target", 0, 0],
        ["current-neighbor", 80, 80],
        ["current-system-neighbor", 1200, 0],
        ["current-system-neighbor-mate", 1280, 80],
        ["current-galaxy-system-a", 3600, 0],
        ["current-galaxy-system-a-mate", 3680, 80],
        ["current-galaxy-system-b", 4800, 0],
        ["current-galaxy-system-b-mate", 4880, 80],
        ["next-target", 11000, 0],
        ["next-neighbor", 11080, 80],
        ["next-system-neighbor", 12200, 0],
        ["next-system-neighbor-mate", 12280, 80],
        ["next-galaxy-system-a", 14600, 0],
        ["next-galaxy-system-a-mate", 14680, 80],
        ["next-galaxy-system-b", 15800, 0],
        ["next-galaxy-system-b-mate", 15880, 80],
      ].map(([name, x, y], index) => ({
        uid: `shared-nav-${name}-${now}`,
        display_name: name,
        message: "Shared ancestry navigation probe.",
        drawing: null,
        x_percent: String(x),
        y_percent: String(y),
        color: index % 2 === 0 ? "#86a6c9" : "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      }));

      window.__sharedNavEvents = [];
      document.addEventListener("animationstart", (event) => {
        if (event.animationName === "cluster-coalesce"
          && event.target.classList?.contains("map-cluster")
          && document.querySelector("[data-mark-canvas]")?.dataset.clusterTransition === "explode") {
          window.__sharedNavEvents.push(event.target.dataset.clusterLevel);
        }
      }, true);

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: [marks[0], marks[8]],
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    await page.getByLabel("Fit whole world").click();
    await page.locator("[data-recent-list]").getByRole("button", { name: /current-target/i }).click();
    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveAttribute("data-name", "current-target", { timeout: 8000 });

    const fitZoom = await page.locator("[data-mark-canvas]").evaluate(() => {
      const canvasElement = document.querySelector("[data-mark-canvas]");
      const world = document.querySelector("[data-canvas-world]");
      const rect = canvasElement.getBoundingClientRect();
      const style = getComputedStyle(world);
      const worldWidth = Number.parseFloat(style.getPropertyValue("--canvas-world-width"));
      const worldHeight = Number.parseFloat(style.getPropertyValue("--canvas-world-height"));
      const padding = 36;
      return Math.min(1, Math.max(1, rect.width - (padding * 2)) / worldWidth, Math.max(1, rect.height - (padding * 2)) / worldHeight);
    });

    await page.evaluate(() => {
      window.__sharedNavEvents = [];
      window.__sharedNavZoomSamples = [];
      const world = document.querySelector("[data-canvas-world]");
      const stopAt = performance.now() + 5200;
      const sample = () => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform);
        window.__sharedNavZoomSamples.push(matrix.a);
        if (performance.now() < stopAt) {
          requestAnimationFrame(sample);
        }
      };
      sample();
    });
    await page.locator("[data-recent-list]").getByRole("button", { name: /next-target/i }).click();

    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveAttribute("data-name", "next-target", { timeout: 9000 });
    const navState = await page.evaluate(() => ({
      events: window.__sharedNavEvents,
      minZoom: Math.min(...window.__sharedNavZoomSamples),
    }));

    expect(navState.events).toContain("system");
    expect(navState.events).toContain("neighbor");
    expect(navState.minZoom).toBeGreaterThan(fitZoom * 1.8);
  });

  test("recent mark traversal hides the full popup until the target is focused", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        ["popup-current", 0, 0],
        ["popup-current-neighbor", 80, 80],
        ["popup-current-system", 1200, 0],
        ["popup-current-system-mate", 1280, 80],
        ["popup-target", 3600, 0],
        ["popup-target-neighbor", 3680, 80],
        ["popup-target-system", 4800, 0],
        ["popup-target-system-mate", 4880, 80],
      ].map(([name, x, y], index) => ({
        uid: `popup-nav-${name}-${now}`,
        display_name: name,
        message: "Popup traversal probe.",
        drawing: null,
        x_percent: String(x),
        y_percent: String(y),
        color: index % 2 === 0 ? "#86a6c9" : "#f0b35a",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      }));

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: [marks[0], marks[4]],
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    await page.locator("[data-recent-list]").getByRole("button", { name: /popup-current/i }).click();
    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveAttribute("data-name", "popup-current", { timeout: 8000 });
    await expect(page.locator("[data-mark-popout]")).toHaveAttribute("data-state", "full");

    await page.locator("[data-recent-list]").getByRole("button", { name: /popup-target/i }).click();
    await expect.poll(async () => page.locator("[data-mark-popout]").evaluate((popout) => (
      popout.hidden ? "hidden" : popout.dataset.state
    ))).not.toBe("full");

    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveAttribute("data-name", "popup-target", { timeout: 9000 });
    await expect(page.locator("[data-mark-popout]")).toBeVisible();
    await expect(page.locator("[data-mark-popout]")).toHaveAttribute("data-state", "full");
  });

  test("exports the whole world as an SVG with all synced marks", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const marks = [
        {
          uid: `export-a-${Date.now()}`,
          display_name: "Export A",
          message: "First exported mark.",
          drawing: null,
          x_percent: "100.00",
          y_percent: "100.00",
          color: "#86a6c9",
          shape: "circle",
          created_at: "2026-05-29 14:00:00",
        },
        {
          uid: `export-b-${Date.now()}`,
          display_name: "Export B",
          message: "Second exported mark.",
          drawing: null,
          x_percent: "1500.00",
          y_percent: "1500.00",
          color: "#f0b35a",
          shape: "square",
          created_at: "2026-05-29 14:01:00",
        },
      ];

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          recent_marks: [marks[1]],
          mark_uids: marks.map((mark) => mark.uid),
        },
      }));
    });

    await page.getByLabel("Fit whole world").click();
    await expect(page.getByLabel("Export whole world")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByLabel("Export whole world").click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(download.suggestedFilename()).toMatch(/mark-world-\d{4}-\d{2}-\d{2}\.svg/);

    const content = require("fs").readFileSync(path, "utf8");
    expect(content).toContain("<svg");
    expect(content).toContain("Export A");
    expect(content).toContain("Export B");
  });

  test("rubberbands camera panning beyond full-world bounds", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));
    });

    const canvas = page.locator("[data-mark-canvas]");
    const world = page.locator("[data-canvas-world]");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120000, box.y + box.height / 2);

    const overscrolledPanX = await world.evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return matrix.m41;
    });
    expect(overscrolledPanX).toBeGreaterThan(0);
    expect(overscrolledPanX).toBeLessThan(6000);

    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect.poll(async () => world.evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return matrix.m41;
    })).toBe(0);

    const minPan = await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const worldWidth = Number.parseFloat(getComputedStyle(element).getPropertyValue("--canvas-world-width"));
      const worldHeight = Number.parseFloat(getComputedStyle(element).getPropertyValue("--canvas-world-height"));

      return {
        x: Math.min(0, rect.width - worldWidth),
        y: Math.min(0, rect.height - worldHeight),
      };
    });

    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 260000, box.y + box.height / 2 - 260000);

    const lowerOverscroll = await world.evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return {
        x: matrix.m41,
        y: matrix.m42,
      };
    });
    expect(lowerOverscroll.x).toBeLessThan(minPan.x);
    expect(lowerOverscroll.y).toBeLessThan(minPan.y);

    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect.poll(async () => world.evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return {
        x: Math.round(matrix.m41),
        y: Math.round(matrix.m42),
      };
    })).toEqual({
      x: Math.round(minPan.x),
      y: Math.round(minPan.y),
    });
  });

  test("reveals a 3x3 explored area and shades the next frontier", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    const canvas = page.locator("[data-mark-canvas]");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));

      const edgeMark = {
        uid: `edge-${Date.now()}`,
        display_name: "Center Test",
        message: "In the middle.",
        drawing: null,
        x_percent: "512.00",
        y_percent: "512.00",
        color: "#86a6c9",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 1,
          marks: [edgeMark],
          mark_uids: [edgeMark.uid],
        },
      }));
    });

    await fitWholeWorld(page);

    const expandedWorld = await canvas.evaluate((element) => {
      const style = getComputedStyle(element);
      const tileRects = Array.from(document.querySelectorAll(".canvas-tile"))
        .map((tile) => {
          return {
            left: Number.parseFloat(tile.style.getPropertyValue("--tile-left")),
            top: Number.parseFloat(tile.style.getPropertyValue("--tile-top")),
            width: Number.parseFloat(tile.style.getPropertyValue("--tile-width")),
            height: Number.parseFloat(tile.style.getPropertyValue("--tile-height")),
          };
        })
        .sort((a, b) => a.top - b.top || a.left - b.left);

      return {
        width: Number.parseFloat(style.getPropertyValue("--canvas-world-width")),
        height: Number.parseFloat(style.getPropertyValue("--canvas-world-height")),
        tileCount: document.querySelectorAll(".canvas-tile").length,
        committedTileCount: document.querySelectorAll(".canvas-tile.is-committed").length,
        unavailableTileCount: document.querySelectorAll(".canvas-tile.is-unavailable").length,
        tileRects,
      };
    });

    expect(expandedWorld.width).toBe(205824);
    expect(expandedWorld.height).toBe(205824);
    expect(expandedWorld.tileCount).toBe(25);
    expect(expandedWorld.committedTileCount).toBe(9);
    expect(expandedWorld.unavailableTileCount).toBe(16);
    for (const tile of expandedWorld.tileRects) {
      expect(tile.width).toBe(1024);
      expect(tile.height).toBe(1024);
      expect(tile.left % 1024).toBe(0);
      expect(tile.top % 1024).toBe(0);
    }
  });

  test("turns adjacent fogged tiles normal when a neighboring explored tile gets a mark", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));

      const centerMark = {
        uid: `border-${Date.now()}`,
        display_name: "Claim Test",
        message: "Claims nearby shaded cells.",
        drawing: null,
        x_percent: "512.00",
        y_percent: "512.00",
        color: "#86a6c9",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };
      const neighboringMark = {
        uid: `neighbor-${Date.now()}`,
        display_name: "Neighbor Claim",
        message: "Expands one tile farther.",
        drawing: null,
        x_percent: "1536.00",
        y_percent: "512.00",
        color: "#f0b35a",
        shape: "square",
        created_at: "2026-05-29 14:01:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 2,
          marks: [centerMark, neighboringMark],
          mark_uids: [centerMark.uid, neighboringMark.uid],
        },
      }));
    });

    await fitWholeWorld(page);

    const tileClasses = await page.evaluate(() => {
      const classes = {};
      document.querySelectorAll(".canvas-tile").forEach((tile) => {
        const tileX = -(Number.parseFloat(tile.style.getPropertyValue("--tile-bg-x")) || 0) / 1024;
        const tileY = -(Number.parseFloat(tile.style.getPropertyValue("--tile-bg-y")) || 0) / 1024;
        classes[`${tileX},${tileY}`] = tile.className;
      });
      return classes;
    });

    expect(tileClasses["0,0"]).toContain("is-committed");
    expect(tileClasses["1,0"]).toContain("is-committed");
    expect(tileClasses["0,1"]).toContain("is-committed");
    expect(tileClasses["1,1"]).toContain("is-committed");
    expect(tileClasses["2,0"]).toContain("is-committed");
    expect(tileClasses["3,0"]).toContain("is-unavailable");
  });

  test("shades bounded tile cells that are not directly adjacent", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));

      const leftMark = {
        uid: `left-edge-${Date.now()}`,
        display_name: "Left Edge",
        message: "Far left.",
        drawing: null,
        x_percent: "-2500.00",
        y_percent: "-2500.00",
        color: "#86a6c9",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };
      const rightMark = {
        uid: `right-edge-${Date.now()}`,
        display_name: "Right Edge",
        message: "Far right.",
        drawing: null,
        x_percent: "101900.00",
        y_percent: "2500.00",
        color: "#f0b35a",
        shape: "square",
        created_at: "2026-05-29 14:01:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 2,
          marks: [leftMark, rightMark],
          mark_uids: [leftMark.uid, rightMark.uid],
        },
      }));
    });

    await fitWholeWorld(page);

    const tileState = await page.evaluate(() => ({
      committed: document.querySelectorAll(".canvas-tile.is-committed").length,
      unavailable: document.querySelectorAll(".canvas-tile.is-unavailable").length,
    }));

    expect(tileState.committed).toBeGreaterThan(0);
    expect(tileState.unavailable).toBeGreaterThan(0);
  });

  test("shades adjacent tiles that fall outside coordinate bounds", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));

      const edgeMark = {
        uid: `right-bound-${Date.now()}`,
        display_name: "Right Bound",
        message: "Near the edge.",
        drawing: null,
        x_percent: "2500.00",
        y_percent: "500.00",
        color: "#86a6c9",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 1,
          marks: [edgeMark],
          mark_uids: [edgeMark.uid],
        },
      }));
    });

    await fitWholeWorld(page);

    const rightEdgeTile = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll(".canvas-tile"));
      const tileStates = tiles.map((tile) => ({
        tileX: -(Number.parseFloat(tile.style.getPropertyValue("--tile-bg-x")) || 0) / 1024,
        tileY: -(Number.parseFloat(tile.style.getPropertyValue("--tile-bg-y")) || 0) / 1024,
        className: tile.className,
      }));

      return tileStates.find((tile) => tile.tileX === 4 && tile.tileY === 0)?.className || "";
    });

    expect(rightEdgeTile).toContain("is-unavailable");
  });

  test("uses all synced marks for tile availability, not only recent marks", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    await page.evaluate(() => {
      const oldMark = {
        uid: `old-mark-${Date.now()}`,
        display_name: "Old Mark",
        message: "Still expands the wall.",
        drawing: null,
        x_percent: "1500.00",
        y_percent: "1500.00",
        color: "#9fc5a8",
        shape: "circle",
        created_at: "2026-05-29 13:00:00",
      };
      const recentMark = {
        uid: `recent-mark-${Date.now()}`,
        display_name: "Recent Mark",
        message: "Shown in recent.",
        drawing: null,
        x_percent: "100.00",
        y_percent: "100.00",
        color: "#f0b35a",
        shape: "square",
        created_at: "2026-05-29 14:00:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 2,
          marks: [oldMark, recentMark],
          recent_marks: [recentMark],
          mark_uids: [oldMark.uid, recentMark.uid],
        },
      }));
    });

    await fitWholeWorld(page);

    const canvasState = await page.evaluate(() => ({
      oldMarkExists: Boolean(document.querySelector("[data-name='Old Mark']")),
      recentNames: Array.from(document.querySelectorAll("[data-recent-list] strong")).map((item) => item.textContent),
      committedTileCount: document.querySelectorAll(".canvas-tile.is-committed").length,
      oldMarkTileClass: Array.from(document.querySelectorAll(".canvas-tile"))
        .find((tile) => tile.style.getPropertyValue("--tile-bg-x") === "-1024px"
          && tile.style.getPropertyValue("--tile-bg-y") === "-1024px")?.className || "",
    }));

    expect(canvasState.oldMarkExists).toBe(true);
    expect(canvasState.recentNames).toEqual(["Recent Mark"]);
    expect(canvasState.committedTileCount).toBeGreaterThan(1);
    expect(canvasState.oldMarkTileClass).toContain("is-committed");
  });

  test("random placement samples explored canvas tiles without expanding before save", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));
    });
    await page.getByLabel("Hide canvas note").click();

    const initialWorld = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector("[data-mark-canvas]"));
      return {
        width: Number.parseFloat(style.getPropertyValue("--canvas-world-width")),
        height: Number.parseFloat(style.getPropertyValue("--canvas-world-height")),
      };
    });

    await page.evaluate(() => {
      const values = [0.2, 0.92, 0.9];
      Math.random = () => values.shift() ?? 0.9;
    });

    const beforeRandomTransform = await page.locator("[data-canvas-world]").evaluate((element) => getComputedStyle(element).transform);
    await page.getByRole("button", { name: /random/i }).click();

    const placement = await page.evaluate(() => ({
      x: Number.parseFloat(document.querySelector("[data-x-field]").value),
      y: Number.parseFloat(document.querySelector("[data-y-field]").value),
      world: {
        width: Number.parseFloat(getComputedStyle(document.querySelector("[data-mark-canvas]")).getPropertyValue("--canvas-world-width")),
        height: Number.parseFloat(getComputedStyle(document.querySelector("[data-mark-canvas]")).getPropertyValue("--canvas-world-height")),
      },
    }));

    expect(placement.x).toBeLessThan(1024);
    expect(placement.y).toBeLessThan(1024);
    await expect.poll(async () => page.locator("[data-canvas-world]").evaluate((element) => getComputedStyle(element).transform)).not.toBe(beforeRandomTransform);
    expect(placement.world).toEqual(initialWorld);
  });

  test("supports expansion into negative top and left tiles", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));

      window.__negativeEdgeUid = `negative-edge-${Date.now()}`;
      const edgeMark = {
        uid: window.__negativeEdgeUid,
        display_name: "Negative Edge Test",
        message: "At the top left edge.",
        drawing: null,
        x_percent: "-125.00",
        y_percent: "-140.00",
        color: "#9fc5a8",
        shape: "diamond",
        created_at: "2026-05-29 14:00:00",
      };

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 1,
          marks: [edgeMark],
          mark_uids: [edgeMark.uid],
        },
      }));
    });

    const world = await page.evaluate(() => {
      const mark = document.querySelector(`[data-uid="${window.__negativeEdgeUid}"]`);
      const style = getComputedStyle(document.querySelector("[data-mark-canvas]"));
      return {
        width: Number.parseFloat(style.getPropertyValue("--canvas-world-width")),
        height: Number.parseFloat(style.getPropertyValue("--canvas-world-height")),
        markX: Number.parseFloat(mark.style.getPropertyValue("--mark-x")),
        markY: Number.parseFloat(mark.style.getPropertyValue("--mark-y")),
      };
    });

    expect(world.width).toBeGreaterThan(1024);
    expect(world.height).toBeGreaterThan(1024);
    expect(world.markX).toBeGreaterThan(0);
    expect(world.markY).toBeGreaterThan(0);
  });
});
