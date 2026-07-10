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

  test("legacy appearance templates are available in their matching modes", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/settings");

    await page.getByRole("button", { name: "Light", exact: true }).click();
    await page.getByRole("combobox").first().click();
    await expect(page.getByRole("option", { name: /Paper/i })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await page.getByRole("combobox").first().click();
    await expect(page.getByRole("option", { name: /Graphite/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /Midnight/i })).toBeVisible();

    await context.close();
  });

  test("sidebar profile menu opens profile settings", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/");
    await page.getByRole("button", { name: /MindTab E2E/i }).click();
    await page.getByRole("button", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/settings\?section=profile/);
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    await context.close();
  });

  test("command menu settings items deep-link to settings sections", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/");
    await page.getByRole("button", { name: /⌘K/ }).click();
    await expect(page.getByText("Settings")).toBeVisible();
    await expect(page.getByText("Theme: Dark")).toHaveCount(0);
    await page.getByText("Keyboard Shortcuts").click();
    await expect(page).toHaveURL(/\/settings\?section=shortcuts/);
    await expect(page.getByRole("heading", { name: "Keyboard Shortcuts" })).toBeVisible();

    await context.close();
  });

  test("task dialog renders from a dashboard task card", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/");
    await page.getByRole("button", { name: /Review workstation sidebar TASK-/i }).click();
    await expect(page.getByRole("dialog")).toContainText(/Review workstation sidebar/i);
    await expect(page).toHaveScreenshot("task-dialog.png", workstationScreenshotOptions);

    await context.close();
  });

  test("notes workspace renders from the dashboard mode switcher", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/");
    await page.getByRole("button", { name: "E2E Launch Plan", exact: true }).click();
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
    await page.getByRole("button", { name: /July 8 at 12 AM/i }).scrollIntoViewIfNeeded();
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
