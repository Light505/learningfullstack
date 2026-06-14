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

test.describe("form validation and state", () => {
  test("submit is disabled until coordinates are chosen and form shows guidance on submit attempt", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));
    });
    await page.getByLabel("Hide canvas note").click();

    const submit = page.locator("[data-submit-button]");
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText("Choose a spot first");

    await page.evaluate(() => {
      document.querySelector("[data-mark-form]").dispatchEvent(new Event("submit", { cancelable: true }));
    });
    await expect(page.locator("[data-form-status]")).toContainText(/choose an open spot/i);
  });

  test("character counts update on display name and message inputs", async ({ page }) => {
    await page.goto("http://localhost:8080/");

    const nameInput = page.getByLabel("Display name");
    const nameCount = page.locator("[data-count-for='display_name']");
    const messageInput = page.getByLabel("Short message");
    const messageCount = page.locator("[data-count-for='message']");

    await expect(nameCount).toHaveText("0");
    await expect(messageCount).toHaveText("0");

    await nameInput.fill("Hello World");
    await expect(nameCount).toHaveText("11");

    await messageInput.fill("A short message here");
    await expect(messageCount).toHaveText("20");
  });

  test("form resets drawing, color, shape, and placement after successful submission", async ({ page }) => {
    await page.goto("http://localhost:8080/");
    await page.getByLabel("Hide canvas note").click();

    const drawingCanvas = page.locator("[data-drawing-canvas]");
    await drawingCanvas.scrollIntoViewIfNeeded();
    const box = await drawingCanvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box.x + 24, box.y + 24);
    await page.mouse.down();
    await page.mouse.move(box.x + 84, box.y + 24);
    await page.mouse.up();

    await expect(page.locator("[data-drawing-field]")).not.toHaveValue("");

    await page.locator(".swatch-option").nth(3).click();
    await page.locator('.shape-option[title="Square"]').click();
    await expect(page.locator('input[name="color"][value="#f0b35a"]')).toBeChecked();
    await expect(page.locator('input[name="shape"][value="square"]')).toBeChecked();

    const randomButton = page.getByRole("button", { name: /random/i });
    await randomButton.click();

    const displayName = `Reset Test ${Date.now()}`;
    await page.getByLabel("Display name").fill(displayName);
    await page.getByLabel("Message").fill("Form reset probe.");

    const submit = page.locator("[data-submit-button]");
    const [postResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/marks.php") && response.request().method() === "POST"),
      submit.click(),
    ]);
    expect(postResponse.ok()).toBeTruthy();

    await expect(page.locator("[data-drawing-field]")).toHaveValue("");
    await expect(page.locator('input[name="color"][value="#d9826b"]')).toBeChecked();
    await expect(page.locator('input[name="shape"][value="circle"]')).toBeChecked();
    await expect(page.locator("[data-placement-marker]")).toBeHidden();
    await expect(page.locator("[data-x-field]")).toHaveValue("");
    await expect(page.locator("[data-y-field]")).toHaveValue("");

    const undoButton = page.getByRole("button", { name: "Undo latest mark" });
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/marks.php") && response.request().method() === "POST"),
      undoButton.click(),
    ]);
  });

  test("rejects placement too close to an existing mark", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const mark = {
        uid: `too-close-${Date.now()}`,
        display_name: "Too Close",
        message: "Block placement nearby.",
        drawing: null,
        x_percent: "0.00",
        y_percent: "0.00",
        color: "#86a6c9",
        shape: "circle",
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
    await page.getByLabel("Hide canvas note").click();

    const markScreenPos = await page.evaluate(() => {
      const dot = document.querySelector(".mark-dot");
      const rect = dot.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });

    await page.evaluate((pos) => {
      document.querySelector("[data-mark-canvas]").dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        button: 0,
        clientX: pos.x,
        clientY: pos.y,
      }));
    }, markScreenPos);

    await expect(page.locator("[data-placement-note]")).toContainText(/too close/i);
    await expect(page.locator("[data-placement-marker]")).toBeHidden();
    await expect(page.locator("[data-submit-button]")).toBeDisabled();
  });
});

test.describe("drawing controls", () => {
  test("clear drawing button removes all strokes and disables undo", async ({ page }) => {
    await page.goto("http://localhost:8080/");

    const drawingCanvas = page.locator("[data-drawing-canvas]");
    const drawingUndo = page.getByLabel("Drawing controls").getByRole("button", { name: "Undo", exact: true });
    await drawingCanvas.scrollIntoViewIfNeeded();
    const box = await drawingCanvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box.x + 24, box.y + 24);
    await page.mouse.down();
    await page.mouse.move(box.x + 84, box.y + 24);
    await page.mouse.up();
    await page.mouse.move(box.x + 24, box.y + 68);
    await page.mouse.down();
    await page.mouse.move(box.x + 84, box.y + 68);
    await page.mouse.up();

    await expect(drawingUndo).toBeEnabled();
    let drawingPayload = await page.locator("[data-drawing-field]").inputValue();
    expect(JSON.parse(drawingPayload).strokes).toHaveLength(2);

    await page.getByRole("button", { name: "Clear drawing" }).click();
    drawingPayload = await page.locator("[data-drawing-field]").inputValue();
    expect(drawingPayload).toBe("");
    await expect(drawingUndo).toBeDisabled();
  });

  test("switching from eraser back to pen hides the eraser indicator and restores draw mode", async ({ page }) => {
    await page.goto("http://localhost:8080/");

    const drawingCanvas = page.locator("[data-drawing-canvas]");
    await drawingCanvas.scrollIntoViewIfNeeded();

    await page.locator("[data-drawing-eraser]").click();
    await expect(page.locator("[data-drawing-eraser-indicator]")).not.toBeHidden();

    const mode = await drawingCanvas.evaluate((el) => el.dataset.mode);
    expect(mode).toBe("erase");

    await page.locator("[data-drawing-pen]").click();
    await expect(page.locator("[data-drawing-eraser-indicator]")).toBeHidden();

    const restoredMode = await drawingCanvas.evaluate((el) => el.dataset.mode);
    expect(restoredMode).toBe("draw");
  });

  test("drawing preview is visible when selecting a mark with drawing data", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const mark = {
        uid: `drawing-preview-${Date.now()}`,
        display_name: "Drawing Preview",
        message: "Has a sketch.",
        drawing: JSON.stringify({ v: 1, strokes: [[[10, 10], [80, 40], [10, 70]]] }),
        drawing_loaded: true,
        x_percent: "0.00",
        y_percent: "0.00",
        color: "#9fc5a8",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 1,
          marks: [mark],
          recent_marks: [mark],
          mark_uids: [mark.uid],
        },
      }));
    });

    await page.locator("[data-recent-list]").getByRole("button", { name: /drawing preview/i }).click();
    await expect(page.locator("[data-mark-popout]")).toBeVisible();
    await expect(page.locator("[data-preview-drawing]")).toBeVisible();
  });
});

test.describe("undo behavior", () => {
  test("undo button is disabled when no last mark uid exists in session", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    const undoButton = page.getByRole("button", { name: "Undo latest mark" });
    await expect(undoButton).toBeDisabled();
  });

  test("undo applies is-undoing class and then removes the mark element", async ({ page }) => {
    await page.goto("http://localhost:8080/");
    await page.getByLabel("Hide canvas note").click();

    const randomButton = page.getByRole("button", { name: /random/i });
    await randomButton.click();

    const displayName = `Undo Anim ${Date.now()}`;
    await page.getByLabel("Display name").fill(displayName);
    await page.getByLabel("Message").fill("Undo animation probe.");

    const submit = page.locator("[data-submit-button]");
    const [postResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/marks.php") && response.request().method() === "POST"),
      submit.click(),
    ]);
    expect(postResponse.ok()).toBeTruthy();

    await expect(page.locator(`[data-uid][data-name="${displayName}"]`)).toHaveCount(1);

    const undoButton = page.getByRole("button", { name: "Undo latest mark" });
    await undoButton.click();

    await expect(page.locator(`[data-uid][data-name="${displayName}"].is-undoing`)).toBeAttached({ timeout: 5000 });
    await expect(page.locator(`[data-uid][data-name="${displayName}"]`)).toHaveCount(0, { timeout: 10000 });
    await expect(undoButton).toBeDisabled();
  });
});

test.describe("focus-latest and recent list", () => {
  test("focus-latest button focuses the first recent mark", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        {
          uid: `focus-latest-a-${now}`,
          display_name: "Focus Latest A",
          message: "First mark.",
          drawing: null,
          x_percent: "0.00",
          y_percent: "0.00",
          color: "#86a6c9",
          shape: "circle",
          created_at: "2026-05-29 14:00:00",
        },
        {
          uid: `focus-latest-b-${now}`,
          display_name: "Focus Latest B",
          message: "Second mark.",
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
          recent_marks: marks,
          mark_uids: marks.map((m) => m.uid),
        },
      }));
    });

    const focusLatestButton = page.getByLabel("Focus latest mark");
    await expect(focusLatestButton).toBeEnabled();
    await focusLatestButton.click();

    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveAttribute("data-name", "Focus Latest A", { timeout: 8000 });
    await expect(page.locator("[data-mark-popout]")).toBeVisible();
  });

  test("empty recent list shows no recent marks text after sync with no marks", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [], recent_marks: [] },
      }));
    });

    await expect(page.locator("[data-recent-list] .recent-empty")).toContainText("No recent marks yet.");
  });
});

test.describe("mark placement animation and state", () => {
  test("newly placed mark receives data-new attribute and canvas gains has-marks class", async ({ page }) => {
    await page.goto("http://localhost:8080/");
    await page.getByLabel("Hide canvas note").click();

    const randomButton = page.getByRole("button", { name: /random/i });
    await randomButton.click();

    const displayName = `New Mark ${Date.now()}`;
    await page.getByLabel("Display name").fill(displayName);
    await page.getByLabel("Message").fill("New mark animation probe.");

    const submit = page.locator("[data-submit-button]");
    const [postResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/marks.php") && response.request().method() === "POST"),
      submit.click(),
    ]);
    expect(postResponse.ok()).toBeTruthy();

    const newMark = page.locator(`[data-uid][data-name="${displayName}"]`);
    await expect(newMark).toHaveAttribute("data-new", "true", { timeout: 5000 });
    await expect(page.locator("[data-mark-canvas]")).toHaveClass(/has-marks/);

    const undoButton = page.getByRole("button", { name: "Undo latest mark" });
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/marks.php") && response.request().method() === "POST"),
      undoButton.click(),
    ]);
  });

  test("canvas has-marks class reflects mark presence", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));
    });
    await expect(page.locator("[data-mark-canvas]")).not.toHaveClass(/has-marks/);

    await page.evaluate(() => {
      const mark = {
        uid: `has-marks-${Date.now()}`,
        display_name: "Has Marks",
        message: "Marks exist now.",
        drawing: null,
        x_percent: "0.00",
        y_percent: "0.00",
        color: "#86a6c9",
        shape: "circle",
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
    await expect(page.locator("[data-mark-canvas]")).toHaveClass(/has-marks/);
  });
});

test.describe("keyboard shortcuts and pan", () => {
  test("pressing 1 sets zoom to 100%", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));
    });

    await page.getByLabel("Zoom in").click();
    await expect(page.getByLabel("Canvas zoom level")).toHaveText("120%");

    await page.keyboard.press("1");
    await expect.poll(async () => page.getByLabel("Canvas zoom level").textContent()).toBe("100%");
    const worldTransform = await page.locator("[data-canvas-world]").evaluate((el) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { a: matrix.a, m41: matrix.m41, m42: matrix.m42 };
    });
    expect(worldTransform.a).toBeCloseTo(1, 2);
  });

  test("space plus arrow keys pans the canvas", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: { ok: true, count: 0, marks: [], mark_uids: [] },
      }));
    });

    const world = page.locator("[data-canvas-world]");
    const beforePan = await world.evaluate((el) => getComputedStyle(el).transform);

    const canvas = page.locator("[data-mark-canvas]");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Space");

    await expect.poll(async () => world.evaluate((el) => getComputedStyle(el).transform)).not.toBe(beforePan);
  });

  test("clicking outside the canvas area dismisses the mark popout", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const mark = {
        uid: `popout-dismiss-${Date.now()}`,
        display_name: "Popout Dismiss",
        message: "Click outside to close.",
        drawing: null,
        x_percent: "0.00",
        y_percent: "0.00",
        color: "#9fc5a8",
        shape: "circle",
        created_at: "2026-05-29 14:00:00",
      };
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: 1,
          marks: [mark],
          recent_marks: [mark],
          mark_uids: [mark.uid],
        },
      }));
    });

    await page.locator("[data-recent-list]").getByRole("button", { name: /popout dismiss/i }).click();
    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveAttribute("data-name", "Popout Dismiss", { timeout: 8000 });
    await expect(page.locator("[data-mark-popout]")).toBeVisible();

    await page.getByLabel("Display name").click();
    await expect(page.locator("[data-mark-popout]")).toBeHidden();
  });
});

test.describe("render mode and mark shape", () => {
  test("canvas render mode transitions from detail to map at fit-world zoom", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const mark = {
        uid: `render-mode-${Date.now()}`,
        display_name: "Render Mode",
        message: "Far enough for map.",
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
          marks: [mark],
          mark_uids: [mark.uid],
        },
      }));
    });

    await expect(page.locator("[data-mark-canvas]")).toHaveAttribute("data-render-mode", "detail");

    await page.getByLabel("Fit whole world").click();
    await expect(page.locator("[data-mark-canvas]")).toHaveAttribute("data-render-mode", "map", { timeout: 8000 });
  });

  test("mark dots render with the correct shape css class", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        {
          uid: `shape-circle-${now}`,
          display_name: "Shape Circle",
          message: "Circle mark.",
          drawing: null,
          x_percent: "0.00",
          y_percent: "0.00",
          color: "#86a6c9",
          shape: "circle",
          created_at: "2026-05-29 14:00:00",
        },
        {
          uid: `shape-square-${now}`,
          display_name: "Shape Square",
          message: "Square mark.",
          drawing: null,
          x_percent: "100.00",
          y_percent: "100.00",
          color: "#f0b35a",
          shape: "square",
          created_at: "2026-05-29 14:01:00",
        },
        {
          uid: `shape-diamond-${now}`,
          display_name: "Shape Diamond",
          message: "Diamond mark.",
          drawing: null,
          x_percent: "200.00",
          y_percent: "200.00",
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
          mark_uids: marks.map((m) => m.uid),
        },
      }));
    });

    const circleMark = page.locator(".mark-dot[data-name='Shape Circle']");
    const squareMark = page.locator(".mark-dot[data-name='Shape Square']");
    const diamondMark = page.locator(".mark-dot[data-name='Shape Diamond']");

    await expect(circleMark).toHaveClass(/circle/);
    await expect(squareMark).toHaveClass(/square/);
    await expect(diamondMark).toHaveClass(/diamond/);
  });
});

test.describe("initial page load has no selected mark", () => {
  test("no mark is selected on initial load and after refresh when marks exist", async ({ page }) => {
    await isolateCanvasData(page);
    await page.goto("http://localhost:8080/");
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        {
          uid: `no-select-a-${now}`,
          display_name: "No Select A",
          message: "First mark.",
          drawing: null,
          x_percent: "0.00",
          y_percent: "0.00",
          color: "#d9826b",
          shape: "circle",
          created_at: "2026-05-29 14:00:00",
        },
        {
          uid: `no-select-b-${now}`,
          display_name: "No Select B",
          message: "Second mark.",
          drawing: null,
          x_percent: "100.00",
          y_percent: "100.00",
          color: "#9fc5a8",
          shape: "square",
          created_at: "2026-05-29 14:01:00",
        },
      ];
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          mark_uids: marks.map((m) => m.uid),
        },
      }));
    });

    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveCount(0);
    await expect(page.locator("[data-preview-name]")).toHaveText("No mark selected");

    await page.reload();
    await page.evaluate(() => {
      const now = Date.now();
      const marks = [
        {
          uid: `no-select-a-${now}`,
          display_name: "No Select A",
          message: "First mark.",
          drawing: null,
          x_percent: "0.00",
          y_percent: "0.00",
          color: "#d9826b",
          shape: "circle",
          created_at: "2026-05-29 14:00:00",
        },
        {
          uid: `no-select-b-${now}`,
          display_name: "No Select B",
          message: "Second mark.",
          drawing: null,
          x_percent: "100.00",
          y_percent: "100.00",
          color: "#9fc5a8",
          shape: "square",
          created_at: "2026-05-29 14:01:00",
        },
      ];
      window.dispatchEvent(new CustomEvent("test:syncMarks", {
        detail: {
          ok: true,
          count: marks.length,
          marks,
          mark_uids: marks.map((m) => m.uid),
        },
      }));
    });

    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveCount(0);
    await expect(page.locator("[data-preview-name]")).toHaveText("No mark selected");

    await page.evaluate(() => {
      const mark = document.querySelector(".mark-dot");
      if (mark) mark.click();
    });
    await expect(page.locator(".mark-dot[data-selected='true']")).toHaveCount(1);
    await expect(page.locator("[data-preview-name]")).not.toHaveText("No mark selected");
  });
});
