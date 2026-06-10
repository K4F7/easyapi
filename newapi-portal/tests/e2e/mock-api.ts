import { expect, type Page } from "@playwright/test";

export const PLAYGROUND_CHAT_TOKEN_ID = 101;
export const PLAYGROUND_IMAGE_TOKEN_ID = 202;

export const DEFAULT_PLAYGROUND_MODELS = {
  models: [
    { id: "gpt-test-model" },
    { id: "claude-3-5-sonnet-latest" },
    { id: "o3-mini-eval" },
  ],
  fallback: false,
};

export const DEFAULT_BILLING_AFF = {
  aff_code: "E2ETEST01",
  aff_count: 3,
  aff_quota: 500_000,
  aff_history_quota: 1_500_000,
};

export function shouldExpectImagePlayground() {
  return (
    process.env.EXPECT_IMAGE_PLAYGROUND === "true" ||
    Boolean(process.env.IMAGE_PLAYGROUND_INTERNAL_URL?.trim()) ||
    Boolean(process.env.STAGING_IMAGE_PLAYGROUND_INTERNAL_URL?.trim())
  );
}

export async function routeQuotaConfig(page: Page) {
  await page.route("**/api/quota/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { config: { quotaPerCny: 500_000, source: "default" } },
      }),
    });
  });
}

export async function routeDashboardSummary(page: Page) {
  await page.route("**/api/dashboard/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          quotaConfig: { quotaPerCny: 500_000, source: "default" },
          user: { email: "e2e@example.com", newApiBinding: "ready" },
          newApi: {
            binding: "ready",
            status: "ready",
            self: {
              quota: 2_000_000,
              used_quota: 100_000,
              request_count: 12,
            },
          },
          tokens: { count: 1, status: "ready" },
          usage: {
            today: { totals: { quota: 10_000, count: 2, tokenUsed: 256 } },
            week: { totals: { quota: 70_000, count: 14, tokenUsed: 1024 } },
          },
          logStats: { rpm: 1, tpm: 64, status: "ready" },
          checkin: {
            enabled: true,
            checkedInToday: false,
            checkedInOn: "2026-06-07",
            status: "AVAILABLE",
            quotaApplied: null,
          },
        },
      }),
    });
  });
}

export async function routeUsageApi(page: Page) {
  await page.route("**/api/usage?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        totals: { quota: 0, count: 0, tokenUsed: 0 },
      }),
    });
  });
}

export async function routeLogsApi(page: Page) {
  await page.route("**/api/logs?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        total: 0,
        totals: { quota: 0, count: 0, tokenUsed: 0 },
      }),
    });
  });
}

export async function routeBillingAffApis(
  page: Page,
  aff = DEFAULT_BILLING_AFF,
) {
  await routeDashboardSummary(page);
  await routeQuotaConfig(page);

  await page.route("**/api/aff", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: aff }),
    });
  });
}

export async function routePlaygroundToken(
  page: Page,
  {
    chatTokenId = PLAYGROUND_CHAT_TOKEN_ID,
    imageTokenId = PLAYGROUND_IMAGE_TOKEN_ID,
    status = 200,
  }: { chatTokenId?: number; imageTokenId?: number; status?: number } = {},
) {
  await page.route("**/api/playground/token**", async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body:
        status === 200
          ? JSON.stringify({
              ok: true,
              data: { chatTokenId, imageTokenId, tokenId: chatTokenId },
            })
          : JSON.stringify({
              ok: false,
              error: { message: "操练场初始化失败" },
            }),
    });
  });
}

export async function routePlaygroundModels(
  page: Page,
  {
    tokenId = PLAYGROUND_CHAT_TOKEN_ID,
    models = DEFAULT_PLAYGROUND_MODELS,
  }: { tokenId?: number; models?: typeof DEFAULT_PLAYGROUND_MODELS } = {},
) {
  await page.route("**/api/playground/models?*", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("tokenId")).toBe(String(tokenId));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: models }),
    });
  });
}

export async function routeImageEmbedConfig(
  page: Page,
  options?: { configured?: boolean },
) {
  const configured = options?.configured ?? shouldExpectImagePlayground();
  await page.route("**/api/playground/images/embed-config**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { configured, theme: "light" },
      }),
    });
  });
}

export async function openMockedPlaygroundChat(page: Page) {
  await routePlaygroundToken(page);
  await routePlaygroundModels(page);
  await page.goto("/dashboard/playground?tab=chat");
  await expect(
    page.getByRole("button", { name: /gpt-test-model|选择模型/ }),
  ).toBeVisible({ timeout: 15_000 });
}
