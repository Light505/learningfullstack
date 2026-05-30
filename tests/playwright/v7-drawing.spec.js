const { test, expect } = require("@playwright/test");

test.describe("Version 7 drawing marks", () => {
  test("submits a compact drawing without a message", async ({ page }) => {
    await page.goto("http://localhost:8080/");

    const entryCount = page.locator("[data-entry-count]");
    const randomButton = page.getByRole("button", { name: /random/i });
    const submit = page.locator("[data-submit-button]");
    const drawingCanvas = page.locator("[data-drawing-canvas]");
    const previewDrawing = page.locator("[data-preview-drawing]");
    const undoButton = page.getByRole("button", { name: /undo/i });
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
