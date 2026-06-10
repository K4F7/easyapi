import { expect, test, type Page } from "@playwright/test";

import {
  attachPageDiagnostics,
  assertNoClientErrors,
  ensureDashboardSession,
  mockChatSseBody,
  skipUnlessAuthenticatedPortalAvailable,
} from "./helpers";
import {
  PLAYGROUND_CHAT_TOKEN_ID,
  PLAYGROUND_IMAGE_TOKEN_ID,
  openMockedPlaygroundChat,
  routeImageEmbedConfig,
  routePlaygroundModels,
  routePlaygroundToken,
  shouldExpectImagePlayground,
} from "./mock-api";


const imagePlaygroundReadySignal = (page: Page) =>
  page
    .getByText("生图 Playground 未配置")
    .or(page.getByText("生图 Playground 加载中"))
    .or(page.locator('iframe[title="生图 Playground"]'));


async function mockChatStream(page: Page, options?: { totalTokens?: number }) {
  await page.route("**/api/playground/chat", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(body)).not.toMatch(/sk-[a-zA-Z0-9]{8,}/);
    expect(body).toEqual(
      expect.objectContaining({
        tokenId: PLAYGROUND_CHAT_TOKEN_ID,
        model: expect.any(String),
        messages: expect.any(Array),
      }),
    );

    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: mockChatSseBody({
        deltas: ["你", "好"],
        totalTokens: options?.totalTokens ?? 128,
      }),
    });
  });
}


test.describe.configure({ mode: "serial" });

test.describe("Playground", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }, testInfo) => {
    skipUnlessAuthenticatedPortalAvailable(test, testInfo.project.name);
    await ensureDashboardSession(page);
  });

  test("sidebar shows 操练场 between 用量 and 设置", async ({ page }) => {
    const labels = await page
      .getByRole("navigation")
      .getByRole("link")
      .allTextContents();
    const usageIdx = labels.findIndex((t) => t.includes("用量"));
    const playgroundIdx = labels.findIndex((t) => t.includes("操练场"));
    const settingsIdx = labels.findIndex((t) => t.includes("设置"));
    expect(usageIdx).toBeGreaterThanOrEqual(0);
    expect(playgroundIdx).toBeGreaterThan(usageIdx);
    expect(settingsIdx).toBeGreaterThan(playgroundIdx);

    const hrefs = await page
      .getByRole("navigation")
      .getByRole("link")
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute("href") ?? ""),
      );
    const usageHrefIdx = hrefs.indexOf("/dashboard/usage");
    const playgroundHrefIdx = hrefs.indexOf("/dashboard/playground");
    const settingsHrefIdx = hrefs.indexOf("/dashboard/profile");
    expect(usageHrefIdx).toBeGreaterThanOrEqual(0);
    expect(playgroundHrefIdx).toBeGreaterThan(usageHrefIdx);
    expect(settingsHrefIdx).toBeGreaterThan(playgroundHrefIdx);
  });

  test("defaults to chat tab; tab switches update URL without full reload", async ({
    page,
  }) => {
    await routePlaygroundToken(page);
    await routePlaygroundModels(page);
    await routeImageEmbedConfig(page);

    const loadEvents: number[] = [];
    page.on("load", () => loadEvents.push(1));

    await page.goto("/dashboard/playground");
    await expect(page).toHaveURL(/\/dashboard\/playground(\?tab=chat)?$/);
    await expect(
      page.getByRole("tab", { name: "对话", selected: true }),
    ).toBeVisible();
    await expect(page.getByText("开始一段对话")).toBeVisible();

    const loadsBeforeTab = loadEvents.length;

    await page.getByRole("tab", { name: "生图" }).click();
    await expect(page).toHaveURL(/tab=image/);
    await expect(imagePlaygroundReadySignal(page)).toBeVisible();
    await expectImageIframeDoesNotExposeRealKey(page);
    expect(loadEvents.length).toBe(loadsBeforeTab);

    await page.getByRole("tab", { name: "对话" }).click();
    await expect(page).toHaveURL(/tab=chat/);
    expect(loadEvents.length).toBe(loadsBeforeTab);
  });

  test("image tab passes portal token marker and token identifiers to the iframe", async ({
    page,
  }) => {
    await routePlaygroundToken(page);
    await routeImageEmbedConfig(page);
    await page.goto("/dashboard/playground?tab=image");
    await expect(imagePlaygroundReadySignal(page)).toBeVisible();
    expect(page.url()).not.toMatch(/sk-|api[_-]?key=/i);

    const iframe = page.locator('iframe[title="生图 Playground"]');
    const unconfiguredPrompt = page.getByText("生图 Playground 未配置");
    if (shouldExpectImagePlayground()) {
      await expect(unconfiguredPrompt).toHaveCount(0);
      await expect(iframe).toHaveCount(1);
    } else if ((await unconfiguredPrompt.count()) > 0) {
      await expect(unconfiguredPrompt).toBeVisible();
      await expect(iframe).toHaveCount(0);
      return;
    }

    await expect(iframe).toHaveCount(1);
    const src = await iframe.first().getAttribute("src");
    expect(src).toBeTruthy();

    const iframeUrl = new URL(src!);
    expect(iframeUrl.pathname).toMatch(/\/playground\/embed\/?$/);
    expect(iframeUrl.origin).toBe(new URL(page.url()).origin);
    expect(iframeUrl.searchParams.get("apiUrl")).toBe(
      new URL(page.url()).origin,
    );
    expect(iframeUrl.searchParams.get("baseUrl")).toBe(
      new URL(page.url()).origin,
    );
    expect(iframeUrl.searchParams.get("imageApiUrl")).toBe(
      `${new URL(page.url()).origin}/api/playground/images/generations`,
    );
    expect(iframeUrl.searchParams.get("tokenId")).toBe(
      String(PLAYGROUND_IMAGE_TOKEN_ID),
    );
    expect(iframeUrl.searchParams.get("portalTokenId")).toBe(
      String(PLAYGROUND_IMAGE_TOKEN_ID),
    );
    expect(iframeUrl.searchParams.get("theme")).toBe("light");
    const apiKey = iframeUrl.searchParams.get("apiKey");
    expect(apiKey).toBe(`portal-token-${PLAYGROUND_IMAGE_TOKEN_ID}`);
    expect(iframeUrl.searchParams.get("playgroundSessionToken")).toBeNull();
    expect(src).not.toMatch(/sk-[a-zA-Z0-9]{8,}/);
  });

  test("/playground/embed/ HTML contains light theme injection", async ({
    page,
  }) => {
    test.skip(
      !shouldExpectImagePlayground(),
      "IMAGE_PLAYGROUND_INTERNAL_URL is required for live embed proxy HTML.",
    );

    await routePlaygroundToken(page);
    await routeImageEmbedConfig(page, { configured: true });
    await page.goto("/dashboard/playground?tab=image");

    const iframe = page.locator('iframe[title="生图 Playground"]');
    await expect(iframe).toHaveCount(1);
    const src = await iframe.first().getAttribute("src");
    expect(src).toBeTruthy();

    const response = await page.request.get(src!);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]?.toLowerCase()).toContain(
      "text/html",
    );

    const html = await response.text();
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain('id="ezapi-embed-light-theme-state"');
    expect(html).toContain('dataset.theme="light"');
    expect(html).toContain('localStorage.setItem("theme","light")');
    expect(html).toContain('id="ezapi-embed-light-theme"');
    expect(html).toContain(":root{color-scheme:light}");
  });

  test("playground token provisioning failure shows error", async ({
    page,
  }) => {
    await routePlaygroundToken(page, { status: 500 });
    await page.goto("/dashboard/playground");
    await expect(page.getByText("操练场初始化失败")).toBeVisible();
    await expect(page.getByRole("button", { name: /E2E Token/ })).toHaveCount(
      0,
    );
  });

  test("chat: suggestions, pills, multiline input, stream and usage", async ({
    page,
  }) => {
    await openMockedPlaygroundChat(page);
    await mockChatStream(page);

    await page
      .getByRole("button", { name: "解释一下 RESTful API 设计原则" })
      .click();
    const textarea = page.locator("textarea").first();
    await expect(textarea).toHaveValue("解释一下 RESTful API 设计原则");

    await page.getByRole("button", { name: "写代码" }).click();
    await expect(textarea).toHaveValue(/帮我写一段代码/);

    await textarea.fill("a\nb\nc");
    const h1 = await textarea.evaluate((el) => el.scrollHeight);
    await textarea.fill("a\nb\nc\nd\ne\nf");
    const h2 = await textarea.evaluate((el) => el.scrollHeight);
    expect(h2).toBeGreaterThanOrEqual(h1);

    await textarea.fill("line1\nline2");
    await textarea.press("Shift+Enter");
    await expect(textarea).toHaveValue(/line1\nline2\n/);
    await textarea.fill("ping");
    await textarea.press("Enter");

    await expect(page.getByText("你好")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/≈\s*128\s*tokens/)).toBeVisible();
  });

  test("chat: stop keeps partial content; clear needs confirmation", async ({
    page,
  }) => {
    await openMockedPlaygroundChat(page);
    await page.unroute("**/api/playground/chat");
    await page.route("**/api/playground/chat", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body: `data: ${JSON.stringify({ choices: [{ delta: { content: "部分" } }] })}\n\n`,
      });
    });

    const textarea = page.locator("textarea").first();
    await textarea.fill("hold");
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByRole("button", { name: "停止生成" })).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole("button", { name: "停止生成" }).click();
    await expect(page.getByRole("button", { name: "发送" })).toBeVisible();

    await mockChatStream(page);
    await textarea.fill("again");
    await textarea.press("Enter");
    await expect(page.getByText("你好")).toBeVisible();

    await page.getByRole("button", { name: "清空对话" }).click();
    await expect(
      page.getByRole("heading", { name: "清空对话？" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByText("你好")).toBeVisible();

    await page.getByRole("button", { name: "清空对话" }).click();
    await page.getByRole("button", { name: "清空" }).click();
    await expect(page.getByText("开始一段对话")).toBeVisible();
  });

  test("chat: upstream errors are sanitized", async ({ page }) => {
    await openMockedPlaygroundChat(page);
    await page.route("**/api/playground/chat", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "UPSTREAM_ERROR",
            message: "上游对话接口返回错误，请稍后重试",
            details: {
              raw: "secret-provider-trace sk-live-abcdef",
            },
          },
        }),
      });
    });

    const textarea = page.locator("textarea").first();
    await textarea.fill("fail");
    await textarea.press("Enter");
    await expect(
      page.getByText("上游对话接口返回错误，请稍后重试"),
    ).toBeVisible();
    await expect(page.getByText(/sk-live|secret-provider/)).toHaveCount(0);
  });

  test("navigation between dashboard pages has no client errors", async ({
    page,
  }) => {
    const failedResponses: string[] = [];
    const notFoundResponses: string[] = [];
    const browserErrors: string[] = [];
    attachPageDiagnostics(
      page,
      failedResponses,
      notFoundResponses,
      browserErrors,
    );

    await openMockedPlaygroundChat(page);
    await routeImageEmbedConfig(page);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "对话", selected: true }),
    ).toBeVisible();
    await page.goto("/dashboard/usage");
    await page.goto("/dashboard/playground?tab=image");
    await page.goto("/dashboard/playground?tab=chat");

    await assertNoClientErrors(
      failedResponses,
      notFoundResponses,
      browserErrors,
    );
  });
});

async function expectImageIframeDoesNotExposeRealKey(page: Page) {
  const iframe = page.locator('iframe[title="生图 Playground"]');
  if ((await iframe.count()) === 0) {
    return;
  }

  const src = await iframe.first().getAttribute("src");
  expect(src).toBeTruthy();
  expect(src).toContain("/playground/embed");
  expect(src).not.toMatch(/sk-[a-zA-Z0-9]{8,}|api[_-]?key=sk-/i);
  expect(src).toMatch(/portal-token-\d+/);
}
