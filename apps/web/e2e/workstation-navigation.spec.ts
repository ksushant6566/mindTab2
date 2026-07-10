import { expect, test } from "@playwright/test";
import { createAuthenticatedPage } from "./helpers/e2e-auth";

test("sidebar preview overlays content while click-pinning changes the layout", async ({ browser, request }) => {
  const { context, page } = await createAuthenticatedPage(browser, request);

  await page.addInitScript(() => {
    window.localStorage.setItem("mindtab-sidebar", JSON.stringify({ collapsed: true }));
  });
  await page.goto("/");

  const sidebarPresentation = page.getByTestId("sidebar-presentation");
  const content = page.getByTestId("workstation-content");
  const toggle = page.getByTestId("sidebar-toggle");
  const initialContentBox = await content.boundingBox();
  const initialToggleBox = await toggle.boundingBox();

  await expect(sidebarPresentation).toHaveAttribute("data-state", "closed");
  await expect(toggle.locator("svg")).toHaveClass(/lucide-arrow-right-to-line/);
  await toggle.hover();
  await expect(sidebarPresentation).toHaveAttribute("data-state", "preview");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  expect(await content.boundingBox()).toEqual(initialContentBox);
  expect(await toggle.boundingBox()).toEqual(initialToggleBox);

  const accountButton = page.getByRole("button", { name: /MindTab E2E/i });
  await accountButton.click();
  await expect(page.getByRole("button", { name: "Profile" })).toBeVisible();
  await page.waitForTimeout(250);
  await expect(sidebarPresentation).toHaveAttribute("data-state", "preview");
  await accountButton.click();

  const vaultLink = page.getByRole("button", { name: "Vault", exact: true });
  await vaultLink.hover();
  await page.waitForTimeout(200);
  await expect(sidebarPresentation).toHaveAttribute("data-state", "preview");
  await vaultLink.click();
  await expect(page).toHaveURL(/\/vault$/);
  await expect(sidebarPresentation).toHaveAttribute("data-state", "closed");
  expect(await content.boundingBox()).toEqual(initialContentBox);
  expect(await toggle.boundingBox()).toEqual(initialToggleBox);

  await toggle.hover();
  await expect(sidebarPresentation).toHaveAttribute("data-state", "preview");
  await toggle.click();
  await expect(sidebarPresentation).toHaveAttribute("data-state", "pinned");
  await expect(toggle.locator("svg")).toHaveClass(/lucide-arrow-left-to-line/);
  await page.mouse.move(800, 600);
  await toggle.hover();
  const sidebarTooltip = page.getByRole("tooltip");
  await expect(sidebarTooltip).toContainText("Toggle sidebar");
  await expect(sidebarTooltip.locator(".lucide-command")).toBeVisible();
  await expect(sidebarTooltip).toContainText("B");
  await page.waitForTimeout(250);
  const pinnedContentBox = await content.boundingBox();
  expect(pinnedContentBox?.x).toBeGreaterThan(initialContentBox?.x ?? 0);
  expect(await toggle.boundingBox()).toEqual(initialToggleBox);

  await toggle.click();
  await page.mouse.move(800, 600);
  await page.waitForTimeout(250);
  await expect(sidebarPresentation).toHaveAttribute("data-state", "closed");
  expect(await content.boundingBox()).toEqual(initialContentBox);
  expect(await toggle.boundingBox()).toEqual(initialToggleBox);

  await page.mouse.move(800, 600);
  await page.waitForTimeout(250);
  await page.keyboard.press("Meta+b");
  await expect(sidebarPresentation).toHaveAttribute("data-state", "pinned");
  await expect(toggle.locator("svg")).toHaveClass(/lucide-arrow-left-to-line/);
  await page.keyboard.press("Meta+b");
  await expect(sidebarPresentation).toHaveAttribute("data-state", "closed");

  await context.close();
});
