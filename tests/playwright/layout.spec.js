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
      canvas.style.setProperty("--canvas-world-width", "300%");
      canvas.style.setProperty("--canvas-world-height", "300%");
      canvas.style.setProperty("--canvas-pan-x", "-100%");
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

  test("adds a 3x3 tile area centered on the saved mark tile", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    const canvas = page.locator("[data-mark-canvas]");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));

      const edgeMark = {
        uid: `edge-${Date.now()}`,
        display_name: "Edge Test",
        message: "At the edge.",
        drawing: null,
        x_percent: "50.00",
        y_percent: "50.00",
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
      return {
        width: Number.parseFloat(style.getPropertyValue("--canvas-world-width")),
        height: Number.parseFloat(style.getPropertyValue("--canvas-world-height")),
        tileCount: document.querySelectorAll(".canvas-tile").length,
      };
    });

    expect(expandedWorld.width).toBe(3072);
    expect(expandedWorld.height).toBe(3072);
    expect(expandedWorld.tileCount).toBe(9);
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

    expect(placement.x).toBeLessThan(100);
    expect(placement.y).toBeLessThan(100);
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
