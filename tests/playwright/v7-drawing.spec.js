const { test, expect } = require("@playwright/test");

test.describe("Version 7 drawing marks", () => {
  test("supports undoing and erasing drawing strokes", async ({ page }) => {
    await page.goto("http://localhost:8080/");

    const drawingCanvas = page.locator("[data-drawing-canvas]");
    const drawingControls = page.getByLabel("Drawing controls");
    const drawingUndo = drawingControls.getByRole("button", { name: "Undo", exact: true });
    await drawingCanvas.scrollIntoViewIfNeeded();
    const box = await drawingCanvas.boundingBox();
    expect(box).not.toBeNull();

    await expect(page.getByRole("group", { name: "Color", exact: true })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Mark color", exact: true })).toBeVisible();
    await expect(drawingUndo).toBeDisabled();

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

    await drawingUndo.click();
    drawingPayload = await page.locator("[data-drawing-field]").inputValue();
    expect(JSON.parse(drawingPayload).strokes).toHaveLength(1);

    await page.getByRole("button", { name: "Erase" }).click();
    await page.mouse.move(box.x + 54, box.y + 24);
    await expect(page.locator("[data-drawing-eraser-indicator]")).toBeVisible();
    await page.mouse.move(box.x + 54, box.y + 24);
    await page.mouse.down();
    await page.mouse.move(box.x + 56, box.y + 24);
    await page.mouse.up();

    drawingPayload = await page.locator("[data-drawing-field]").inputValue();
    const erasedStrokes = JSON.parse(drawingPayload).strokes;
    expect(erasedStrokes.length).toBeGreaterThan(1);
    await expect(drawingUndo).toBeEnabled();
    await expect(page.getByRole("button", { name: "Clear drawing" })).toBeEnabled();
  });

  test("keeps a captured drawing stroke continuous across canvas leave", async ({ page }) => {
    await page.goto("http://localhost:8080/");

    const drawingCanvas = page.locator("[data-drawing-canvas]");
    await drawingCanvas.scrollIntoViewIfNeeded();
    const box = await drawingCanvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box.x + 20, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 20, box.y + 30);
    await page.mouse.move(box.x + 80, box.y + 60);
    await page.mouse.up();

    const drawingPayload = await page.locator("[data-drawing-field]").inputValue();
    const strokes = JSON.parse(drawingPayload).strokes;
    expect(strokes).toHaveLength(1);
    expect(strokes[0].length).toBeGreaterThan(2);
  });

  test("submits a compact drawing without a message", async ({ page }) => {
    await page.goto("http://localhost:8080/");

    const entryCount = page.locator("[data-entry-count]");
    const randomButton = page.getByRole("button", { name: /random/i });
    const submit = page.locator("[data-submit-button]");
    const drawingCanvas = page.locator("[data-drawing-canvas]");
    const previewDrawing = page.locator("[data-preview-drawing]");
    const undoButton = page.getByRole("button", { name: "Undo latest mark" });
    const startingCount = Number(await entryCount.textContent());

    await page.evaluate(() => {
      const values = [0, 0.54, 0.55];
      Math.random = () => values.shift() ?? 0.55;
    });
    await randomButton.click();
    await expect(submit).toBeEnabled();
    await page.getByLabel("Display name").fill(`Sketch ${Date.now()}`);

    await drawingCanvas.scrollIntoViewIfNeeded();
    const box = await drawingCanvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + 24, box.y + 32);
    await page.mouse.down();
    await page.mouse.move(box.x + 74, box.y + 54);
    await page.mouse.move(box.x + 128, box.y + 38);
    await page.mouse.up();

    const [postResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/marks.php") && response.request().method() === "POST"),
      submit.click(),
    ]);
    expect(postResponse.ok()).toBeTruthy();

    await expect(entryCount).toHaveText(String(startingCount + 1));
    await expect(page.locator("[data-preview-message]")).toHaveText("A quiet sketch without words.");
    await expect(previewDrawing).toBeVisible();

    const apiResponse = await page.request.get("http://localhost:8080/api/marks.php");
    expect(apiResponse.ok()).toBeTruthy();
    const apiPayload = await apiResponse.json();
    expect(apiPayload.marks.some((mark) => mark.drawing && mark.display_name.startsWith("Sketch "))).toBe(true);

    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      undoButton.click(),
    ]);
  });
});
