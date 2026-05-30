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
    const undoButton = page.getByRole("button", { name: /undo/i });

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
      await page.mouse.click(visibleMark.screenX, visibleMark.screenY);
      await expect(placementNote).toContainText(/too close/i);
      await expect(marker).toBeHidden();
    }

    await canvas.scrollIntoViewIfNeeded();
    const placementBox = await canvas.boundingBox();
    expect(placementBox).not.toBeNull();
    const openSpot = await page.evaluate(() => {
      const canvasElement = document.querySelector("[data-mark-canvas]");
      const rect = canvasElement.getBoundingClientRect();
      const style = getComputedStyle(canvasElement);
      const panX = Number.parseFloat(style.getPropertyValue("--canvas-pan-x")) || 0;
      const panY = Number.parseFloat(style.getPropertyValue("--canvas-pan-y")) || 0;
      const zoom = Number.parseFloat(style.getPropertyValue("--canvas-zoom")) || 1;
      const markElements = Array.from(document.querySelectorAll(".mark-dot"));
      const minDistance = Number.parseFloat(canvasElement.dataset.minDistance || "4.5");
      const minX = Math.max(5, ((0 - panX) / zoom / rect.width) * 100);
      const maxX = Math.min(95, ((rect.width - panX) / zoom / rect.width) * 100);
      const minY = Math.max(5, ((0 - panY) / zoom / rect.height) * 100);
      const maxY = Math.min(95, ((rect.height - panY) / zoom / rect.height) * 100);
      for (let y = minY; y <= maxY; y += 6) {
        for (let x = minX; x <= maxX; x += 6) {
          const isOpen = markElements.every((mark) => {
            const dx = x - Number.parseFloat(mark.dataset.x || "0");
            const dy = y - Number.parseFloat(mark.dataset.y || "0");
            return Math.sqrt((dx * dx) + (dy * dy)) >= minDistance;
          });
          if (isOpen) {
            const screenX = rect.left + panX + ((x / 100) * rect.width * zoom);
            const screenY = rect.top + panY + ((y / 100) * rect.height * zoom);
            if (screenX <= rect.left + 8 || screenX >= rect.right - 8 || screenY <= rect.top + 8 || screenY >= rect.bottom - 8) {
              continue;
            }
            const target = document.elementFromPoint(screenX, screenY);
            if (!target || target.closest(".mark-dot") || target.closest(".canvas-hint")) {
              continue;
            }
            return {
              screenX,
              screenY,
            };
          }
        }
      }
      return {
        screenX: rect.left + rect.width / 2,
        screenY: rect.top + rect.height / 2,
      };
    });
    await page.mouse.click(openSpot.screenX, openSpot.screenY);
    await expect(marker).toBeVisible();
    await expect(submit).toBeEnabled();

    const markerBeforeRandom = await marker.evaluate((element) => ({
      x: element.style.getPropertyValue("--placement-x"),
      y: element.style.getPropertyValue("--placement-y"),
    }));

    await page.evaluate(() => {
      const values = [0.54, 0.55];
      Math.random = () => values.shift() ?? 0.55;
    });
    await randomButton.click();
    await expect(marker).toBeVisible();
    const markerAfterRandom = await marker.evaluate((element) => ({
      x: element.style.getPropertyValue("--placement-x"),
      y: element.style.getPropertyValue("--placement-y"),
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

    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/marks.php") && response.request().method() === "POST"),
      submit.click(),
    ]);

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
      page.waitForLoadState("domcontentloaded"),
      undoButton.click(),
    ]);

    await expect(entryCount).toHaveText(String(startingCount));
  });
});
