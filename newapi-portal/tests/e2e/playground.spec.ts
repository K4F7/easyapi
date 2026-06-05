import { expect, test, type Page } from "@playwright/test";

import {
  attachPageDiagnostics,
  assertNoClientErrors,
  E2E_IDENTIFIER,
  E2E_PASSWORD,
  ensureDashboardSession,
  mockChatSseBody,
} from "./helpers";

const identifier = E2E_IDENTIFIER;
const password = E2E_PASSWORD;

const MASKED_TOKENS = {
  items: [
    { id: 101, name: "E2E Token A", key: "sk-e2e…mask" },
    { id: 202, name: "E2E Token B", key: "sk-other…xyz" },
  ],
  total: 2,
};

const MODELS_A = {
  models: [{ id: "gpt-test-model" }, { id: "claude-test-model" }],
  fallback: false,
};

const MODELS_B = {
  models: [{ id: "only-on-b" }],
  fallback: true,
};

const imagePlaygroundReadySignal = (page: Page) =>
  page
    .getByText("生图 Playground 未配置")
    .or(page.getByText("请选择试玩令牌"))
    .or(page.locator('iframe[title="生图 Playground"]'));

const shouldExpectImagePlayground = () =>
  process.env.EXPECT_IMAGE_PLAYGROUND === "true" ||
  Boolean(process.env.NEXT_PUBLIC_IMAGE_PLAYGROUND_URL?.trim()) ||
  Boolean(process.env.STAGING_IMAGE_PLAYGROUND_URL?.trim());

async function mockTokens(
  page: Page,
  payload: typeof MASKED_TOKENS | { items: []; total: 0 },
) {
  await page.route("**/api/tokens?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: payload }),
    });
  });
}

async function mockModels(page: Page) {
  await page.route("**/api/playground/models?*", async (route) => {
    const tokenId = new URL(route.request().url()).searchParams.get("tokenId");
    const data = tokenId === "202" ? MODELS_B : MODELS_A;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data }),
    });
  });
}

async function mockImageSession(page: Page) {
  await page.route("**/api/playground/images/session**", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<
      string,
      unknown
    >;
    expect(body).toEqual({ tokenId: 101 });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          token:
            "portal-image-session-v1.eyJ1c2VySWQiOiJwb3J0YWwtdXNlci0xIiwidG9rZW5JZCI6MTAxfQ.test-signature",
          tokenType: "Bearer",
          expiresIn: 600,
        },
      }),
    });
  });
}

async function mockChatStream(page: Page, options?: { totalTokens?: number }) {
  await page.route("**/api/playground/chat", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(body)).not.toMatch(/sk-[a-zA-Z0-9]{8,}/);
    expect(body).toEqual(
      expect.objectContaining({
        tokenId: expect.any(Number),
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

async function openPlaygroundChat(page: Page) {
  await mockTokens(page, MASKED_TOKENS);
  await mockModels(page);
  await page.goto("/dashboard/playground?tab=chat");
  await expect(
    page.getByRole("button", { name: /gpt-test-model|选择模型/ }),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("Playground", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    test.skip(
      !identifier || !password,
      "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD.",
    );
    await ensureDashboardSession(page);
  });

  test("sidebar shows 操练场 between 用量 and 个人", async ({ page }) => {
    const labels = await page
      .getByRole("navigation")
      .getByRole("link")
      .allTextContents();
    const usageIdx = labels.findIndex((t) => t.includes("用量"));
    const playgroundIdx = labels.findIndex((t) => t.includes("操练场"));
    const profileIdx = labels.findIndex((t) => t.includes("个人"));
    expect(usageIdx).toBeGreaterThanOrEqual(0);
    expect(playgroundIdx).toBeGreaterThan(usageIdx);
    expect(profileIdx).toBeGreaterThan(playgroundIdx);
  });

  test("defaults to chat tab; tab switches update URL without full reload", async ({
    page,
  }) => {
    await mockTokens(page, MASKED_TOKENS);
    await mockModels(page);
    await mockImageSession(page);

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

  test("image tab passes only token identifiers to the iframe", async ({
    page,
  }) => {
    await mockTokens(page, MASKED_TOKENS);
    await mockImageSession(page);
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
    expect(iframeUrl.searchParams.get("apiUrl")).toBe(
      new URL(page.url()).origin,
    );
    expect(iframeUrl.searchParams.get("baseUrl")).toBe(
      new URL(page.url()).origin,
    );
    expect(iframeUrl.searchParams.get("imageApiUrl")).toBe(
      `${new URL(page.url()).origin}/api/playground/images/generations`,
    );
    expect(iframeUrl.searchParams.get("tokenId")).toBe("101");
    expect(iframeUrl.searchParams.get("portalTokenId")).toBe("101");
    expect(iframeUrl.searchParams.get("apiKey")).toMatch(
      /^portal-image-session-v1\./,
    );
    expect(iframeUrl.searchParams.get("playgroundSessionToken")).toBe(
      iframeUrl.searchParams.get("apiKey"),
    );
    expect(src).not.toMatch(/sk-[a-zA-Z0-9]{8,}|portal-token-101/);
  });

  test("empty token list prompts creating a token", async ({ page }) => {
    await mockTokens(page, { items: [], total: 0 });
    await page.goto("/dashboard/playground");
    await expect(
      page.getByRole("link", { name: /去「令牌」页创建/ }),
    ).toHaveAttribute("href", "/dashboard/tokens");
  });

  test("token selector shows name and masked key only", async ({ page }) => {
    await mockTokens(page, MASKED_TOKENS);
    await page.goto("/dashboard/playground");
    await expect(
      page.getByRole("button", { name: /E2E Token A/ }),
    ).toBeVisible();
    await expect(page.getByText("sk-e2e…mask")).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
  });

  test("chat: suggestions, pills, multiline input, stream and usage", async ({
    page,
  }) => {
    await openPlaygroundChat(page);
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
    await openPlaygroundChat(page);
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

  test("chat: switching token resets unavailable model", async ({ page }) => {
    await openPlaygroundChat(page);
    await expect(
      page.getByRole("button", { name: /gpt-test-model/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: /E2E Token A/ }).click();
    await page.getByRole("menuitem", { name: /E2E Token B/ }).click();
    await expect(page.getByRole("button", { name: /only-on-b/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /gpt-test-model/ }),
    ).toHaveCount(0);
  });

  test("chat: upstream errors are sanitized", async ({ page }) => {
    await openPlaygroundChat(page);
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

    await openPlaygroundChat(page);
    await mockImageSession(page);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "操练场", level: 1 }),
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
  expect(src).toMatch(/portal-image-session-v1\./);
  expect(src).not.toMatch(
    /sk-[a-zA-Z0-9]{8,}|portal-token-\d+|api[_-]?key=sk-/i,
  );
}
