import { expect, test, type Page } from "@playwright/test";

import {
  E2E_IDENTIFIER,
  E2E_PASSWORD,
  ensureDashboardSession,
  mockChatSseBody,
  shouldSkipUnauthenticatedCiProject,
} from "./helpers";

const PLAYGROUND_CHAT_TOKEN_ID = 101;
const PLAYGROUND_IMAGE_TOKEN_ID = 202;

const CHAT_POLISH_MODELS = {
  models: [
    { id: "gpt-test-model" },
    { id: "claude-3-5-sonnet-latest" },
    { id: "o3-mini-eval" },
  ],
  fallback: false,
};

async function mockPlaygroundToken(page: Page) {
  await page.route("**/api/playground/token**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          chatTokenId: PLAYGROUND_CHAT_TOKEN_ID,
          imageTokenId: PLAYGROUND_IMAGE_TOKEN_ID,
          tokenId: PLAYGROUND_CHAT_TOKEN_ID,
        },
      }),
    });
  });
}

async function mockModels(page: Page) {
  await page.route("**/api/playground/models?*", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("tokenId")).toBe(
      String(PLAYGROUND_CHAT_TOKEN_ID),
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: CHAT_POLISH_MODELS }),
    });
  });
}

async function openPlaygroundChat(page: Page) {
  await mockPlaygroundToken(page);
  await mockModels(page);
  await page.goto("/dashboard/playground?tab=chat");
  await expect(
    page.getByRole("button", { name: /gpt-test-model|选择模型/ }),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Chat polish", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      shouldSkipUnauthenticatedCiProject(testInfo.project.name),
      "Authenticated specs run in authenticated-chromium on CI.",
    );
    test.skip(
      !E2E_IDENTIFIER || !E2E_PASSWORD,
      "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD.",
    );
    await ensureDashboardSession(page);
  });

  test("model selector search filters model names", async ({ page }) => {
    await openPlaygroundChat(page);

    await page.getByRole("button", { name: "gpt-test-model" }).click();
    const search = page.getByLabel("搜索模型");
    await expect(search).toBeVisible();
    await search.fill("claude");

    await expect(
      page.getByRole("menuitem", { name: "claude-3-5-sonnet-latest" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "gpt-test-model" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: "o3-mini-eval" }),
    ).toHaveCount(0);

    await search.fill("not-a-real-model");
    await expect(page.getByText("没有匹配的模型")).toBeVisible();
  });

  test("mobile message layout remains readable without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openPlaygroundChat(page);

    const longText =
      "mobile-overflow-check-" + "abcdefghijklmnopqrstuvwxyz".repeat(12);
    await page.route("**/api/playground/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body: mockChatSseBody({
          content: `assistant-${longText}`,
          totalTokens: 256,
        }),
      });
    });

    const textarea = page.locator("textarea").first();
    await textarea.fill(longText);
    await textarea.press("Enter");

    await expect(page.getByText(`assistant-${longText}`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/≈\s*256\s*tokens/)).toBeVisible();

    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      messageListWidth:
        document
          .querySelector('[data-testid="chat-message-list"]')
          ?.getBoundingClientRect().width ?? 0,
      widestBubble: Math.max(
        0,
        ...Array.from(
          document.querySelectorAll('[data-testid="chat-message-bubble"]'),
        ).map((el) => el.getBoundingClientRect().width),
      ),
    }));

    expect(overflow.documentWidth).toBeLessThanOrEqual(
      overflow.viewportWidth + 1,
    );
    expect(overflow.widestBubble).toBeLessThanOrEqual(
      overflow.messageListWidth + 1,
    );
  });
});
