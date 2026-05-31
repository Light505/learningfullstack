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

  test("rejects placement outside committed canvas tiles", async ({ page }) => {
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

  test("rubberbands camera panning beyond tile bounds", async ({ page }) => {
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
    await page.mouse.move(box.x + box.width / 2 + 1400, box.y + box.height / 2);

    const overscrolledPanX = await world.evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return matrix.m41;
    });
    expect(overscrolledPanX).toBeGreaterThan(0);
    expect(overscrolledPanX).toBeLessThan(1400);

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
    await page.mouse.move(box.x + box.width / 2 - 3600, box.y + box.height / 2 - 3600);

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

  test("claims a 3x3 area and shades the next frontier", async ({ page }) => {
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

    const expandedWorld = await canvas.evaluate((element) => {
      const style = getComputedStyle(element);
      const tileRects = Array.from(document.querySelectorAll(".canvas-tile"))
        .map((tile) => {
          const rect = tile.getBoundingClientRect();
          const worldRect = document.querySelector("[data-canvas-world]").getBoundingClientRect();

          return {
            left: rect.left - worldRect.left,
            top: rect.top - worldRect.top,
            width: rect.width,
            height: rect.height,
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

    expect(expandedWorld.width).toBe(5120);
    expect(expandedWorld.height).toBe(5120);
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

  test("turns adjacent shaded tiles normal when a neighboring claimed tile gets a mark", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));

      const borderMark = {
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

      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 1,
          marks: [borderMark],
          mark_uids: [borderMark.uid],
        },
      }));
    });

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
    expect(tileClasses["2,0"]).toContain("is-unavailable");
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

    const rightEdgeTile = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll(".canvas-tile"));
      const tileStates = tiles.map((tile) => ({
        tileX: -(Number.parseFloat(tile.style.getPropertyValue("--tile-bg-x")) || 0) / 1024,
        className: tile.className,
      }));
      const farthestTileX = Math.max(...tileStates.map((tile) => tile.tileX));

      return tileStates.find((tile) => tile.tileX === farthestTileX)?.className || "";
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

  test("random placement samples committed canvas tiles without expanding before save", async ({ page }) => {
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
