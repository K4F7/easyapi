import { expect, test } from "@playwright/test";

import {
  ensureDashboardSession,
  mockChatSseBody,
  skipUnlessAuthenticatedPortalAvailable,
} from "./helpers";
import {
  openMockedPlaygroundChat,
  routeDashboardSummary,
  routeQuotaConfig,
} from "./mock-api";

test.describe("Chat polish", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }, testInfo) => {
    skipUnlessAuthenticatedPortalAvailable(test, testInfo.project.name);
    await routeDashboardSummary(page);
    await routeQuotaConfig(page);
    await ensureDashboardSession(page);
  });

  test("model selector search filters model names", async ({ page }) => {
    await openMockedPlaygroundChat(page);

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
    await expect(page.getByText(/没有匹配的模型|未找到匹配的模型/)).toBeVisible();
  });

  test("mobile message layout remains readable without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openMockedPlaygroundChat(page);

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
