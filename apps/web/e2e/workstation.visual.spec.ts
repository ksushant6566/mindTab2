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
    path: "/chat",
    name: "chat-empty",
    text: /What can I help with/i,
  },
  {
    path: "/chat/00000000-0000-4000-8000-000000000401",
    name: "chat-detail",
    text: /visual coverage are being hardened/i,
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
      await expect(page.locator("body")).toContainText(route.text, { timeout: 15_000 });
      if (route.name.startsWith("chat")) {
        await expect(page.getByPlaceholder("Ask anything about your workspace…")).toBeEnabled();
      }
      if (route.name === "chat-detail") {
        await expect(page.getByRole("button", { name: "Conversation options" })).toBeVisible();
        await expect(page.getByTestId("workstation-header-context").locator(":scope > svg")).toHaveCount(0);
        await expect(page.getByTestId("chat-transcript")).toHaveClass(/max-w-4xl/);
        await expect(page.getByTestId("chat-composer")).toHaveClass(/max-w-4xl/);
      }
      if (route.name.startsWith("chat") || route.name === "vault" || route.name === "vault-detail") {
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
      }
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

  test("chat keeps completed workspace step payloads private", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/chat/00000000-0000-4000-8000-000000000401");
    await expect(page.getByText("I'll check the vault first, then summarize what is ready to review.", { exact: true })).toHaveCount(1);
    const toolStep = page.getByText("Searching your vault", { exact: true });
    await expect(toolStep).toBeVisible();
    await expect(toolStep.locator("xpath=..").locator("svg")).toHaveCount(1);
    await expect(page.getByText("Completed", { exact: true })).toHaveClass(/sr-only/);
    await expect(page.getByRole("button", { name: /Searching your vault details/i })).toHaveCount(0);
    await expect(page.getByText("Parameters", { exact: true })).toHaveCount(0);
    await expect(page.getByText("MindTab visual baseline", { exact: true })).toHaveCount(0);

    const responseActions = page.getByTestId("assistant-message-actions").last();
    const copyResponse = responseActions.getByRole("button", { name: "Copy response" });
    await expect(responseActions).toHaveClass(/-mt-2/);
    await expect(copyResponse).toHaveClass(/h-7/);
    await expect(copyResponse).toHaveClass(/p-1/);
    await expect(copyResponse.getByTestId("copy-response-icon")).toHaveCount(1);
    await expect(responseActions.locator("time")).toHaveText(/^(?:[1-9]|1[0-2]):[0-5]\d$/);
    await expect(responseActions.locator("time")).toHaveAttribute("datetime", /.+/);

    const userActions = page.getByTestId("user-message-actions").last();
    const copyUserMessage = userActions.getByRole("button", { name: "Copy message" });
    await expect(userActions).toHaveClass(/ml-auto/);
    await expect(userActions).toHaveClass(/mt-1/);
    await expect(copyUserMessage.getByTestId("copy-user-message-icon")).toHaveCount(1);
    await expect(userActions.locator("time")).toHaveText(/^(?:[1-9]|1[0-2]):[0-5]\d$/);
    await expect(userActions.locator("time")).toHaveAttribute("datetime", /.+/);

    await context.close();
  });

  test("chat composer exposes project and configured model selection", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.route("**/ai/providers**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          providers: [
            {
              id: "gemini",
              name: "Google Gemini",
              configured: true,
              managed: true,
              key_hint: null,
              models: [
                { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast workspace assistance" },
              ],
            },
          ],
        }),
      });
    });
    await page.route("**/projects?**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "00000000-0000-4000-8000-000000000601",
            name: "Website launch",
            status: "active",
            startDate: "2026-07-01",
            createdBy: "e2e-user",
            lastUpdatedBy: "e2e-user",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ]),
      });
    });
    await page.route("**/conversations?**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) });
    });

    await page.goto("/chat");
    const projectSelector = page.getByTestId("chat-project-selector");
    const modelSelector = page.getByTestId("chat-model-selector");
    await expect(projectSelector).toContainText("All projects");
    await expect(modelSelector).toContainText("Gemini 2.5 Flash");
    await projectSelector.click();
    await page.getByRole("option", { name: "Website launch" }).click();
    await expect(projectSelector).toContainText("Website launch");
    await expect(page.getByTestId("chat-composer")).toHaveScreenshot(
      "composer-model-project-selectors.png",
      workstationScreenshotOptions,
    );

    await context.close();
  });

  test("model settings progressively reveal and mask provider keys", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);
    let configured = false;

    await page.route("**/ai/providers**", async (route) => {
      const method = route.request().method();
      if (method === "PUT") configured = true;
      if (method === "DELETE") configured = false;
      if (method !== "GET") {
        await route.fulfill({
          status: method === "DELETE" ? 204 : 200,
          contentType: "application/json",
          body: method === "DELETE" ? "" : JSON.stringify({ provider: "openai", configured: true, key_hint: "•••• 1234" }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          providers: [
            {
              id: "openai",
              name: "OpenAI",
              configured,
              managed: false,
              key_hint: configured ? "•••• 1234" : null,
              models: [{ id: "gpt-5.2", name: "GPT-5.2", description: "Complex workspace reasoning" }],
            },
          ],
        }),
      });
    });

    await page.goto("/settings?section=models");
    await expect(page.getByRole("heading", { name: "Models" })).toBeVisible();
    await page.getByRole("button", { name: "Connect" }).click();
    const keyInput = page.getByLabel("OpenAI API key");
    await keyInput.fill("sk-e2e-example-1234");
    await page.getByRole("button", { name: "Save key" }).click();
    await expect(page.getByText(/•••• 1234/)).toBeVisible();
    await expect(keyInput).toHaveCount(0);
    await expect(page.getByText("sk-e2e-example-1234")).toHaveCount(0);
    await expect(page.locator("main")).toHaveScreenshot("settings-models.png", workstationScreenshotOptions);

    await context.close();
  });

  test("chat progressively reveals conversation management actions", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/chat/00000000-0000-4000-8000-000000000401");
    await expect(page.getByTestId("chat-header-actions")).toBeVisible();
    expect(await page.getByTestId("chat-header-actions").evaluate(
      (element) => element.parentElement?.dataset.testid,
    )).toBe("workstation-header-context");
    await expect(page.getByTestId("workstation-header-context")).toContainText("E2E workstation chat");
    await page.getByRole("button", { name: "Conversation options" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download transcript" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("e2e-workstation-chat.md");
    await page.getByRole("button", { name: "Conversation options" }).click();
    await page.getByRole("menuitem", { name: "Delete conversation" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Delete this conversation?");
    await page.getByRole("button", { name: "Keep conversation" }).click();

    await context.close();
  });

  test("vault add flow offers link and media upload modes", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/vault");
    await page.getByRole("button", { name: "Add to vault" }).click();
    const dialog = page.getByRole("dialog", { name: "Add to your vault" });
    await expect(dialog.getByLabel("Article, post, video, or reel URL")).toBeVisible();
    await dialog.getByLabel("Article, post, video, or reel URL").fill("https://example.com/useful-reference");
    await expect(dialog.getByRole("button", { name: "Add to vault" })).toBeEnabled();
    await dialog.getByRole("tab", { name: "File upload" }).click();
    await expect(dialog).toContainText(/Drop a file here, or choose one/i);

    await context.close();
  });

  test("vault progressively reveals filters and collection actions", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/vault");
    await expect(page.locator("body")).toContainText(/1 item loaded/i);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByRole("menuitemradio", { name: "Images" })).toBeVisible();
    await page.getByRole("menuitemradio", { name: "Images" }).click();
    await expect(page.getByRole("button", { name: "Images", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Vault options" }).click();
    await expect(page.getByRole("menuitem", { name: "Refresh vault" })).toBeVisible();

    await context.close();
  });

  test("vault progressively reveals secondary saved content", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/vault/00000000-0000-4000-8000-000000000501");
    await expect(page.getByTestId("workstation-header-context")).toContainText(/Vault.*MindTab visual baseline/i);
    const extractedContent = page.getByText("Seeded saved item for Playwright visual coverage.");
    await expect(extractedContent).toBeHidden();
    await page.getByRole("button", { name: /Extracted content/i }).click();
    await expect(extractedContent).toBeVisible();

    await page.getByRole("button", { name: "Saved item options" }).click();
    await expect(page.getByRole("menuitem", { name: "Open original" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete saved item" })).toBeVisible();

    await context.close();
  });

  test("vault creates, opens, and deletes a saved link through the API", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/vault");
    await page.getByRole("button", { name: "Add to vault" }).click();
    const dialog = page.getByRole("dialog", { name: "Add to your vault" });
    const savedURL = `https://example.com/mindtab-e2e-${Date.now()}`;
    await dialog.getByLabel("Article, post, video, or reel URL").fill(savedURL);
    await dialog.getByRole("button", { name: "Add to vault" }).click();

    await expect(page).toHaveURL(/\/vault\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("workstation-header-context")).toContainText("example.com");
    await page.getByRole("button", { name: "Saved item options" }).click();
    await page.getByRole("menuitem", { name: "Delete saved item" }).click();
    await page.getByRole("button", { name: "Delete item" }).click();
    await expect(page).toHaveURL(/\/vault$/);
    await expect(page.locator("body")).toContainText("MindTab visual baseline");

    await context.close();
  });

  test("legacy appearance templates are available in their matching modes", async ({ browser, request }) => {
    const { context, page } = await createAuthenticatedPage(browser, request);

    await page.goto("/settings");

    await page.getByRole("button", { name: "Light", exact: true }).click();
    await page.getByRole("combobox").first().click();
    await expect(page.getByRole("option", { name: /Paper/i })).toBeVisible();
    await page.keyboard.press("Escape");

    const darkModeSaved = page.waitForResponse((response) =>
      response.url().endsWith("/users/me") && response.request().method() === "PATCH" && response.ok()
    );
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await darkModeSaved;
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
    const commandDialog = page.getByRole("dialog");
    await expect(commandDialog.getByText("Settings", { exact: true })).toBeVisible();
    await expect(commandDialog.getByText("Theme: Dark")).toHaveCount(0);
    await commandDialog.getByText("Keyboard Shortcuts").click();
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
