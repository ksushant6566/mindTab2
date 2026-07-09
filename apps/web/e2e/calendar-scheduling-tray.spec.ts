import { expect, test } from "@playwright/test";
import { createAuthenticatedPage } from "./helpers/e2e-auth";

test.describe("calendar scheduling tray", () => {
  test("filters active unscheduled tasks and schedules by drag-and-drop", async ({ browser, request }, testInfo) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.addInitScript(() => {
      window.localStorage.setItem("mindtab-calendar-view", "day");
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Calendar", exact: true }).click();

    const reviewCard = page.getByRole("button", { name: /Review workstation sidebar TASK-.*In Progress/i });
    const prepareCard = page.getByRole("button", { name: /Prepare appearance presets TASK-.*To Do/i });
    const reviewDragHandle = page.getByRole("button", { name: /Drag Review workstation sidebar onto the calendar/i });

    await expect(page.getByText("Unscheduled", { exact: true })).toBeVisible();
    await expect(page.getByText("2 active tasks")).toBeVisible();
    await expect(reviewCard).toBeVisible();
    await expect(prepareCard).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath("calendar-scheduling-tray-before.png"),
      fullPage: true,
      animations: "disabled",
    });

    await page.getByRole("button", { name: /In progress 1/i }).click();
    await expect(reviewCard).toBeVisible();
    await expect(prepareCard).toHaveCount(0);

    await page.getByRole("button", { name: /All 2/i }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "No project" }).click();
    await expect(page.getByText("No active unscheduled tasks match this filter.")).toBeVisible();

    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "E2E Launch Plan" }).click();
    await expect(reviewCard).toBeVisible();

    const dropCell = page.getByRole("button", { name: /July 8 at 5 AM/i });
    await reviewDragHandle.dragTo(dropCell);

    await expect(reviewDragHandle).toHaveCount(0);
    await expect(page.getByText("1 active task")).toBeVisible();
    await expect(page.getByRole("button", { name: /Review workstation sidebar,/i })).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath("calendar-scheduling-tray.png"),
      fullPage: true,
      animations: "disabled",
    });

    await context.close();
  });
});
