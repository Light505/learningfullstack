const { test, expect } = require("@playwright/test");

test.describe("Version 5 mark UI", () => {
  test("places, lists, refreshes, and undoes a mark without a full reload", async ({ page }) => {
    await page.goto("http://localhost:8080/");

    const canvas = page.locator("[data-mark-canvas]");
    const marker = page.locator("[data-placement-marker]");
    const submit = page.locator("[data-submit-button]");
    const placementNote = page.locator("[data-placement-note]");
    const entryCount = page.locator("[data-entry-count]");
    const recentList = page.locator("[data-recent-list]");
    const randomButton = page.getByRole("button", { name: /random/i });
    const undoButton = page.getByRole("button", { name: "Undo latest mark" });

    await expect(canvas).toBeVisible();
    await expect(randomButton).toBeEnabled();
    await page.getByLabel("Hide canvas note").click();

    const startingCount = Number(await entryCount.textContent());
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const visibleMark = await page.evaluate(() => {
      const canvasElement = document.querySelector("[data-mark-canvas]");
      const rect = canvasElement.getBoundingClientRect();
      for (const mark of document.querySelectorAll(".mark-dot")) {
        const markRect = mark.getBoundingClientRect();
        const screenX = markRect.right + 4;
        const screenY = markRect.top + markRect.height / 2;
        if (screenX > rect.left + 20 && screenX < rect.right - 20 && screenY > rect.top + 20 && screenY < rect.bottom - 20) {
          return {
            screenX,
            screenY,
          };
        }
      }
      return null;
    });

    if (visibleMark) {
      await page.evaluate(({ screenX, screenY }) => {
        const canvasElement = document.querySelector("[data-mark-canvas]");
        canvasElement.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          button: 0,
          clientX: screenX,
          clientY: screenY,
        }));
      }, visibleMark);
      await expect(placementNote).toContainText(/too close/i);
      await expect(marker).toBeHidden();
    }

    await page.evaluate(() => {
      const values = [0, 0.2, 0.2];
      Math.random = () => values.shift() ?? 0.2;
    });
    await randomButton.click();
    await expect(marker).toBeVisible();
    await expect(submit).toBeEnabled();

    const markerBeforeRandom = await page.evaluate(() => ({
      x: document.querySelector("[data-x-field]").value,
      y: document.querySelector("[data-y-field]").value,
    }));

    await page.evaluate(() => {
      const values = [0, 0.7, 0.7];
      Math.random = () => values.shift() ?? 0.55;
    });
    await randomButton.click();
    await expect(marker).toBeVisible();
    const markerAfterRandom = await page.evaluate(() => ({
      x: document.querySelector("[data-x-field]").value,
      y: document.querySelector("[data-y-field]").value,
    }));
    expect(markerAfterRandom).not.toEqual(markerBeforeRandom);

    const displayName = `Playwright ${Date.now()}`;
    const message = "Version 5 live recent mark";

    await page.locator(".swatch-option").nth(3).click();
    await page.locator('.shape-option[title="Square"]').click();
    await expect(page.locator('input[name="color"][value="#f0b35a"]')).toBeChecked();
    await expect(page.locator('input[name="shape"][value="square"]')).toBeChecked();
    await expect(page.locator(".shape-icon.square")).toHaveCSS("background-color", "rgb(240, 179, 90)");

    await page.getByLabel("Display name").fill(displayName);
    await page.getByLabel("Message").fill(message);
    await expect(submit).toBeEnabled();

    const [postResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/marks.php") && response.request().method() === "POST"),
      submit.click(),
    ]);
    expect(postResponse.ok(), await postResponse.text()).toBeTruthy();

    await expect(entryCount).toHaveText(String(startingCount + 1));
    await expect(recentList).toContainText(displayName);
    await expect(recentList).toContainText(message);
    await expect(page.locator(".mark-dot", { hasText: "" })).toHaveCount(startingCount + 1);

    const apiResponse = await page.request.get("http://localhost:8080/api/marks.php");
    expect(apiResponse.ok()).toBeTruthy();
    const apiPayload = await apiResponse.json();
    expect(apiPayload.ok).toBe(true);
    expect(apiPayload.count).toBe(startingCount + 1);
    const savedMark = apiPayload.marks.find((mark) => mark.display_name === displayName);
    expect(savedMark).toBeTruthy();
    expect(savedMark.shape).toBe("square");
    expect(savedMark.color).toBe("#f0b35a");

    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/marks.php") && response.request().method() === "POST"),
      undoButton.click(),
    ]);

    await expect(entryCount).toHaveText(String(startingCount));
    await expect(page.locator("[data-form-status]")).toHaveText("Latest mark removed.");
    await expect(undoButton).toBeDisabled();
  });
});
