import { expect, test, type Page, type Route } from "@playwright/test";

import { ensureDashboardSession } from "./helpers";

const identifier = process.env.E2E_PORTAL_IDENTIFIER;
const password = process.env.E2E_PORTAL_PASSWORD;
const devMockEnabled = process.env.PORTAL_DEV_MOCK === "1";

type MockToken = {
  id: number;
  name: string;
  key: string;
  status: number;
  remain_quota: number;
  used_quota: number;
  unlimited_quota: boolean;
  group?: string;
};

type MockTier = {
  id: string;
  label: string;
  group: string;
  stability: string;
  description: string;
  default?: boolean;
};

const channelTiers: MockTier[] = [
  {
    id: "low",
    label: "低价渠道",
    group: "low-cost",
    stability: "~50% 在线",
    description: "低成本，适合非关键任务或可重试场景。",
  },
  {
    id: "standard",
    label: "一般渠道",
    group: "default",
    stability: "~80% 在线",
    description: "默认推荐，适合日常开发与一般业务调用。",
    default: true,
  },
  {
    id: "premium",
    label: "高价渠道",
    group: "premium",
    stability: "~99.9% 在线",
    description: "高稳定性，适合关键业务和生产调用。",
  },
];

const envMappedTiers: MockTier[] = [
  {
    id: "starter",
    label: "开发环境",
    group: "env-dev-mapped",
    stability: "~70% 在线",
    description: "来自 BFF 的开发环境分组。",
  },
  {
    id: "standard",
    label: "预发环境",
    group: "env-stage-mapped",
    stability: "~90% 在线",
    description: "来自 BFF 的预发环境分组。",
    default: true,
  },
  {
    id: "prod",
    label: "生产环境",
    group: "env-prod-mapped",
    stability: "~99.9% 在线",
    description: "来自 BFF 的生产环境分组。",
  },
];

test.describe("Token channel tier UI", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !devMockEnabled && (!identifier || !password),
      "Set PORTAL_DEV_MOCK=1 or E2E_PORTAL_IDENTIFIER/E2E_PORTAL_PASSWORD to run token channel UI tests.",
    );

    await page.route("**/api/quota/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            config: {
              unit: "CNY",
              quotaPerCny: 71428.5,
              minimumAmountCny: 1,
            },
          },
        }),
      });
    });
  });

  test("creates tokens with a default standard tier and selectable premium tier", async ({
    page,
  }) => {
    const createRequests: Array<Record<string, unknown>> = [];

    await routeChannelTiers(page);
    await routeTokenList(page, [
      tokenFixture({
        id: 102,
        name: "Frontend Dev",
        key: "sk-dev...tend",
        group: "default",
        remain_quota: 250000,
        used_quota: 5200,
      }),
      tokenFixture({
        id: 103,
        name: "Legacy Token",
        key: "sk-leg...oken",
      }),
      tokenFixture({
        id: 104,
        name: "操练场-Chat",
        key: "sk-play...chat",
        group: "default",
      }),
      tokenFixture({
        id: 105,
        name: "操练场-测试",
        key: "sk-user...test",
        group: "default",
      }),
    ]);

    await page.route("**/api/tokens", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const body = JSON.parse(route.request().postData() ?? "{}") as Record<
        string,
        unknown
      >;
      createRequests.push(body);

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            token: {
              id: 200 + createRequests.length,
              name: body.name,
              key: "sk-new...test",
              status: 1,
              group: body.group,
            },
            key: "sk-new-created-secret",
            keyReturnedOnce: true,
          },
        }),
      });
    });

    await authenticate(page);
    await page.goto("/dashboard/tokens");

    await expect(page.getByRole("heading", { name: "API 令牌" })).toBeVisible();
    await expect(page.getByText("一般渠道").first()).toBeVisible();
    await expect(page.getByText("旧 Token，沿用上游默认分组")).toBeVisible();

    const playgroundRow = page.locator("tr", { hasText: "操练场-Chat" });
    await expect(
      playgroundRow.getByRole("button", { name: /当前渠道：一般渠道/ }),
    ).toBeDisabled();
    await expect(playgroundRow.getByText("系统托管")).toBeVisible();

    const userNamedPlaygroundRow = page.locator("tr", { hasText: "操练场-测试" });
    await expect(
      userNamedPlaygroundRow.getByRole("button", { name: /当前渠道：一般渠道/ }),
    ).toBeEnabled();
    await expect(
      userNamedPlaygroundRow.getByRole("button", {
        name: "删除令牌 操练场-测试",
      }),
    ).toBeEnabled();

    await page.getByRole("button", { name: "创建新令牌" }).click();
    await expect(
      page.getByRole("radio", { name: /一般渠道/ }),
    ).toHaveAttribute("aria-checked", "true");
    await page.getByLabel("名称").fill("Default Channel Token");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "令牌已创建" }),
    ).toBeVisible();
    expect(createRequests[0]).toEqual(
      expect.objectContaining({
        name: "Default Channel Token",
        group: "default",
      }),
    );

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "令牌已创建" }),
    ).toBeHidden();
    await page.getByRole("button", { name: "创建新令牌" }).click();
    await page.getByRole("radio", { name: /高价渠道/ }).click();
    await page.getByLabel("名称").fill("Premium Token");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    expect(createRequests[1]).toEqual(
      expect.objectContaining({
        name: "Premium Token",
        group: "premium",
      }),
    );
  });

  test("submits the BFF returned env-mapped groups on create and update", async ({
    page,
  }) => {
    const createRequests: Array<Record<string, unknown>> = [];
    const updateRequests: Array<Record<string, unknown>> = [];

    await routeChannelTiers(page, {
      tiers: envMappedTiers,
      defaultGroup: "env-stage-mapped",
    });
    await routeTokenList(page, [
      tokenFixture({
        id: 301,
        name: "Env Token",
        key: "sk-env...oken",
        group: "env-stage-mapped",
      }),
    ]);

    await page.route("**/api/tokens", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const body = JSON.parse(route.request().postData() ?? "{}") as Record<
        string,
        unknown
      >;
      createRequests.push(body);

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            token: {
              id: 401,
              name: body.name,
              key: "sk-env...new",
              status: 1,
              group: body.group,
            },
            key: "sk-env-created-secret",
            keyReturnedOnce: true,
          },
        }),
      });
    });

    await page.route("**/api/tokens/301", async (route) => {
      expect(route.request().method()).toBe("PUT");
      const body = JSON.parse(route.request().postData() ?? "{}") as Record<
        string,
        unknown
      >;
      updateRequests.push(body);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            token: tokenFixture({
              id: 301,
              name: "Env Token",
              key: "sk-env...oken",
              group: String(body.group),
            }),
          },
        }),
      });
    });

    await authenticate(page);
    await page.goto("/dashboard/tokens");

    await page.getByRole("button", { name: "创建新令牌" }).click();
    await expect(
      page.getByRole("radio", { name: /预发环境/ }),
    ).toHaveAttribute("aria-checked", "true");
    await page.getByLabel("名称").fill("Env Default Token");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "令牌已创建" }),
    ).toBeVisible();
    expect(createRequests).toEqual([
      expect.objectContaining({
        name: "Env Default Token",
        group: "env-stage-mapped",
      }),
    ]);

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "令牌已创建" }),
    ).toBeHidden();
    const envRow = page.locator("tr", { hasText: "Env Token" });
    const envTierButton = envRow.getByRole("button", {
      name: /当前渠道：预发环境/,
    });
    await expect(envTierButton).toBeEnabled();
    await envTierButton.click();
    await page.getByRole("menuitem", { name: /生产环境/ }).click();

    await expect(page.getByText("令牌渠道已更新").first()).toBeVisible();
    await expect(
      page
        .locator("tr", { hasText: "Env Token" })
        .getByRole("button", { name: /当前渠道：生产环境/ }),
    ).toBeVisible();
    expect(updateRequests).toEqual([{ group: "env-prod-mapped" }]);
  });

  test("updates a normal token tier through the BFF contract", async ({
    page,
  }) => {
    const updateRequests: Array<Record<string, unknown>> = [];

    await routeChannelTiers(page);
    await routeTokenList(page, [
      tokenFixture({
        id: 102,
        name: "Frontend Dev",
        key: "sk-dev...tend",
        group: "default",
        remain_quota: 250000,
        used_quota: 5200,
      }),
    ]);

    await page.route("**/api/tokens/102", async (route) => {
      expect(route.request().method()).toBe("PUT");
      const body = JSON.parse(route.request().postData() ?? "{}") as Record<
        string,
        unknown
      >;
      updateRequests.push(body);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            token: tokenFixture({
              id: 102,
              name: "Frontend Dev",
              key: "sk-dev...tend",
              group: "low-cost",
              remain_quota: 250000,
              used_quota: 5200,
            }),
          },
        }),
      });
    });

    await authenticate(page);
    await page.goto("/dashboard/tokens");

    await page.getByRole("button", { name: /当前渠道：一般渠道/ }).click();
    await page.getByRole("menuitem", { name: /低价渠道/ }).click();

    await expect(page.getByText("令牌渠道已更新").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /当前渠道：低价渠道/ }),
    ).toBeVisible();
    expect(updateRequests).toEqual([{ group: "low-cost" }]);
  });

  test("keeps the previous tier label and shows an error when PUT fails", async ({
    page,
  }) => {
    const updateRequests: Array<Record<string, unknown>> = [];

    await routeChannelTiers(page);
    await routeTokenList(page, [
      tokenFixture({
        id: 102,
        name: "Frontend Dev",
        key: "sk-dev...tend",
        group: "default",
      }),
    ]);

    await page.route("**/api/tokens/102", async (route) => {
      expect(route.request().method()).toBe("PUT");
      updateRequests.push(
        JSON.parse(route.request().postData() ?? "{}") as Record<
          string,
          unknown
        >,
      );

      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "TOKEN_UPDATE_FAILED",
            message: "渠道更新失败",
          },
        }),
      });
    });

    await authenticate(page);
    await page.goto("/dashboard/tokens");

    await page.getByRole("button", { name: /当前渠道：一般渠道/ }).click();
    await page.getByRole("menuitem", { name: /高价渠道/ }).click();

    await expect(page.getByText("渠道更新失败").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /当前渠道：一般渠道/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /当前渠道：高价渠道/ }),
    ).toHaveCount(0);
    expect(updateRequests).toEqual([{ group: "premium" }]);
  });

  for (const scenario of [
    {
      name: "404",
      route: async (route: Route) => {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: "渠道档位不存在",
            },
          }),
        });
      },
    },
    {
      name: "500",
      route: async (route: Route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: {
              code: "CHANNEL_TIERS_FAILED",
              message: "渠道档位加载失败",
            },
          }),
        });
      },
    },
    {
      name: "empty tiers",
      route: async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              tiers: [],
              defaultGroup: "default",
            },
          }),
        });
      },
    },
  ]) {
    test(`disables create and token tier editing when tiers returns ${scenario.name}`, async ({
      page,
    }) => {
      const createRequests: Array<Record<string, unknown>> = [];
      const updateRequests: Array<Record<string, unknown>> = [];

      await page.route("**/api/channels/tiers", scenario.route);
      await routeTokenList(page, [
        tokenFixture({
          id: 102,
          name: "Frontend Dev",
          key: "sk-dev...tend",
          group: "default",
        }),
      ]);

      await page.route("**/api/tokens", async (route) => {
        if (route.request().method() === "POST") {
          createRequests.push(
            JSON.parse(route.request().postData() ?? "{}") as Record<
              string,
              unknown
            >,
          );
        }
        await route.fallback();
      });
      await page.route("**/api/tokens/102", async (route) => {
        if (route.request().method() === "PUT") {
          updateRequests.push(
            JSON.parse(route.request().postData() ?? "{}") as Record<
              string,
              unknown
            >,
          );
        }
        await route.fallback();
      });

      await authenticate(page);
      await page.goto("/dashboard/tokens");

      await expect(page.getByText("渠道档位加载失败。")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "创建新令牌" }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: /当前渠道：自定义分组/ }),
      ).toBeDisabled();

      expect(createRequests).toEqual([]);
      expect(updateRequests).toEqual([]);
    });
  }

  test("keeps the table usable on mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await routeChannelTiers(page);
    await routeTokenList(page, [
      tokenFixture({
        id: 102,
        name: "Frontend Dev",
        key: "sk-dev...tend",
        group: "default",
      }),
      tokenFixture({
        id: 103,
        name: "Production Token",
        key: "sk-prod...oken",
        group: "premium",
      }),
    ]);

    await authenticate(page);
    await page.goto("/dashboard/tokens");

    const table = page.locator("table");
    await expect(table).toBeVisible();
    await expect(table.locator("tr", { hasText: "Frontend Dev" })).toBeVisible();
    await table.evaluate((element) => {
      element.scrollIntoView();
      const scrollContainer = element.closest("div.overflow-x-auto");
      if (!scrollContainer) {
        throw new Error("Expected token table to be horizontally scrollable");
      }
      scrollContainer.scrollLeft = scrollContainer.scrollWidth;
    });
    await expect(
      table.locator("tr", { hasText: "Production Token" }).getByText("高价渠道"),
    ).toBeVisible();
  });
});

async function routeChannelTiers(
  page: Page,
  {
    tiers = channelTiers,
    defaultGroup = "default",
  }: {
    tiers?: MockTier[];
    defaultGroup?: string;
  } = {},
) {
  await page.route("**/api/channels/tiers", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          tiers,
          defaultGroup,
        },
      }),
    });
  });
}

async function routeTokenList(page: Page, items: MockToken[]) {
  await page.route("**/api/tokens?p=1&size=50", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          items,
          total: items.length,
          page: 1,
          page_size: 50,
        },
      }),
    });
  });
}

function tokenFixture(overrides: Partial<MockToken>): MockToken {
  return {
    id: 1,
    name: "Token",
    key: "sk-token...test",
    status: 1,
    remain_quota: 100000,
    used_quota: 0,
    unlimited_quota: false,
    ...overrides,
  };
}

async function authenticate(page: Parameters<typeof ensureDashboardSession>[0]) {
  if (!devMockEnabled) {
    await ensureDashboardSession(page);
    return;
  }

  const response = await page.request.post("/api/auth/login", {
    data: {
      identifier: "dev@example.com",
      password: "dev-password",
    },
  });
  expect(response.ok()).toBe(true);
}
