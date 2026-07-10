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
  const back = page.getByTestId("navigation-back");
  const forward = page.getByTestId("navigation-forward");
  const initialContentBox = await content.boundingBox();
  const initialToggleBox = await toggle.boundingBox();

  await expect(sidebarPresentation).toHaveAttribute("data-state", "closed");
  await expect(toggle.locator("svg")).toHaveClass(/lucide-arrow-right-to-line/);
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();
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
  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();
  await expect(sidebarPresentation).toHaveAttribute("data-state", "closed");
  expect(await content.boundingBox()).toEqual(initialContentBox);
  expect(await toggle.boundingBox()).toEqual(initialToggleBox);

  await back.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(back).toBeDisabled();
  await expect(forward).toBeEnabled();
  await forward.click();
  await expect(page).toHaveURL(/\/vault$/);
  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();

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

test("login is not an eligible navigation destination", async ({ browser, request }) => {
  const { context, page } = await createAuthenticatedPage(browser, request);

  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("navigation-back")).toBeDisabled();
  await expect(page.getByTestId("navigation-forward")).toBeDisabled();

  await context.close();
});

test("header context moves smoothly with the pinned sidebar", async ({ browser, request }) => {
  const { context, page } = await createAuthenticatedPage(browser, request);

  await page.addInitScript(() => {
    window.localStorage.setItem("mindtab-sidebar", JSON.stringify({ collapsed: true }));
  });
  await page.goto("/?view=tasks");
  await expect(page.getByTestId("sidebar-toggle")).toBeVisible();
  await expect(page.getByTestId("workstation-header-context")).toBeVisible();

  const positions = await page.evaluate(async () => {
    const toggle = document.querySelector<HTMLElement>("[data-testid='sidebar-toggle']");
    const context = document.querySelector<HTMLElement>("[data-testid='workstation-header-context']");
    if (!toggle || !context) throw new Error("Navigation controls did not render");

    const sampleShortcut = async () => {
      const samples = [context.getBoundingClientRect().x];
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true, bubbles: true, cancelable: true }));
      for (let frame = 0; frame < 18; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        samples.push(context.getBoundingClientRect().x);
      }
      return samples;
    };

    return {
      opening: await sampleShortcut(),
      closing: await sampleShortcut(),
    };
  });

  const openingDeltas = positions.opening.slice(1).map((position, index) => position - positions.opening[index]!);
  const closingDeltas = positions.closing.slice(1).map((position, index) => position - positions.closing[index]!);
  expect(positions.opening.at(-1)! - positions.opening[0]!).toBeGreaterThan(150);
  expect(positions.closing[0]! - positions.closing.at(-1)!).toBeGreaterThan(150);
  expect(Math.min(...openingDeltas)).toBeGreaterThan(-5);
  expect(Math.max(...closingDeltas)).toBeLessThan(5);
  expect(Math.max(...openingDeltas.map(Math.abs), ...closingDeltas.map(Math.abs))).toBeLessThan(80);

  await context.close();
});

test("dashboard history restores task, note, and project context", async ({ browser, request }) => {
  const { context, page } = await createAuthenticatedPage(browser, request);

  await page.goto("/?view=tasks");
  const back = page.getByTestId("navigation-back");
  const forward = page.getByTestId("navigation-forward");
  const headerContext = page.getByTestId("workstation-header-context");

  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();

  await page.getByRole("button", { name: "E2E Launch Plan", exact: true }).click();
  await page.getByRole("button", { name: /^Notes\b/ }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("notes");
  const projectId = new URL(page.url()).searchParams.get("project");
  expect(projectId).toBeTruthy();
  await expect(page.locator("body")).toContainText(/Workstation audit notes/i);
  await expect(headerContext).toContainText("E2E Launch Plan");
  await expect(headerContext).toContainText("Notes");

  await page.getByRole("button", { name: /^Tasks\b/ }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("tasks");
  expect(new URL(page.url()).searchParams.get("project")).toBe(projectId);
  await expect(page.getByRole("button", { name: /Review workstation sidebar TASK-/i })).toBeVisible();
  await expect(headerContext).toContainText("E2E Launch Plan");
  await expect(headerContext).toContainText("Tasks");

  await back.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("notes");
  expect(new URL(page.url()).searchParams.get("project")).toBe(projectId);
  await expect(page.locator("body")).toContainText(/Workstation audit notes/i);
  await expect(headerContext).toContainText("E2E Launch Plan");
  await expect(headerContext).toContainText("Notes");
  await expect(forward).toBeEnabled();

  await back.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("tasks");
  expect(new URL(page.url()).searchParams.get("project")).toBeNull();
  await expect(back).toBeDisabled();

  await forward.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("notes");
  expect(new URL(page.url()).searchParams.get("project")).toBe(projectId);
  await expect(page.locator("body")).toContainText(/Workstation audit notes/i);
  await expect(headerContext).toContainText("E2E Launch Plan");
  await expect(headerContext).toContainText("Notes");

  await page.reload();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("notes");
  expect(new URL(page.url()).searchParams.get("project")).toBe(projectId);
  await expect(page.locator("body")).toContainText(/Workstation audit notes/i);
  await expect(headerContext).toContainText("E2E Launch Plan");
  await expect(headerContext).toContainText("Notes");

  await context.close();
});
