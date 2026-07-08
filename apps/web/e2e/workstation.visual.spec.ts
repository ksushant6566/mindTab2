import { expect, test } from "@playwright/test";
import { createAuthenticatedPage, createOnboardingPage } from "./helpers/e2e-auth";

const workstationScreenshotOptions = {
  fullPage: true,
  animations: "disabled",
  maxDiffPixelRatio: 0.02,
} as const;

const visualRoutes = [
  {
    path: "/",
    name: "dashboard",
    text: /Review workstation sidebar/i,
  },
  {
    path: "/settings",
    name: "settings",
    text: /appearance|general|profile/i,
  },
  {
    path: "/chat/00000000-0000-4000-8000-000000000401",
    name: "chat-detail",
    text: /visual e2e coverage are being hardened/i,
  },
  {
    path: "/vault",
    name: "vault",
    text: /MindTab visual baseline/i,
  },
  {
    path: "/vault/00000000-0000-4000-8000-000000000501",
    name: "vault-detail",
    text: /MindTab visual baseline|Playwright visual coverage/i,
  },
] as const;

test.describe("authenticated workstation visual checks", () => {
  test.describe.configure({ mode: "serial" });

  for (const route of visualRoutes) {
    test(`${route.path} renders the authenticated workstation`, async ({ browser, request }) => {
      const { context, page } = await createAuthenticatedPage(browser, request);

      await page.goto(route.path);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).toContainText(route.text);
      await expect(page).toHaveScreenshot(`${route.name}.png`, workstationScreenshotOptions);

      await context.close();
    });
  }

  test("sidebar account menu uses the shared account presentation", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/");
    await expect(page.locator("body")).toContainText(/MindTab E2E/i);
    await page.getByRole("button", { name: /MindTab E2E/i }).click();
    await expect(page.locator("body")).toContainText(/Log out/i);
    await expect(page).toHaveScreenshot("sidebar-account-menu.png", workstationScreenshotOptions);

    await context.close();
  });

  test("task dialog renders from a dashboard task card", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/");
    await page.getByText("Review workstation sidebar").click();
    await expect(page.getByRole("dialog")).toContainText(/Review workstation sidebar/i);
    await expect(page).toHaveScreenshot("task-dialog.png", workstationScreenshotOptions);

    await context.close();
  });

  test("notes workspace renders from the dashboard mode switcher", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/");
    await page.getByRole("button", { name: "Notes" }).click();
    await expect(page.locator("body")).toContainText(/Workstation audit notes/i);
    await expect(page).toHaveScreenshot("notes-workspace.png", workstationScreenshotOptions);

    await context.close();
  });

  test("calendar workspace renders from the sidebar action", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/");
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    await expect(page.locator("body")).toContainText(/Unscheduled|Today|Week|Month/i);
    await page.getByText("12AM", { exact: true }).scrollIntoViewIfNeeded();
    await expect(page).toHaveScreenshot("calendar-workspace.png", workstationScreenshotOptions);

    await context.close();
  });

  test("onboarding welcome step renders for a new web user", async ({ browser, request }) => {
    const { context, page } = await createOnboardingPage(browser, request);

    await page.goto("/");
    await expect(page.locator("body")).toContainText(/Step 1 of 5/i);
    await expect(page.locator("body")).toContainText(/Most productivity tools ask you to change how you work/i);
    await expect(page).toHaveScreenshot("onboarding-welcome.png", workstationScreenshotOptions);

    await context.close();
  });
});
