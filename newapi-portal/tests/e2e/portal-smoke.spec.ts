import { expect, test } from "@playwright/test";

const identifier = process.env.E2E_PORTAL_IDENTIFIER;
const password = process.env.E2E_PORTAL_PASSWORD;

test.describe("NewAPI Portal smoke", () => {
  test("health endpoint reports the portal service as OK", async ({ request }) => {
    const response = await request.get("/api/health");
    const payload = await response.json();

    expect(response.ok()).toBeTruthy();
    expect(payload).toEqual(
      expect.objectContaining({
        ok: true,
        service: "newapi-portal",
      }),
    );
  });

  test("login page exposes password login and no OAuth entry points", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
    await expect(page.getByLabel("邮箱或用户名")).toBeVisible();
    await expect(page.getByLabel("密码")).toBeVisible();
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
    await expect(page.getByRole("link", { name: "注册" })).toHaveAttribute(
      "href",
      "/register",
    );

    await expect(
      page.getByRole("button", { name: /github|oauth|google/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /github|oauth|google/i }),
    ).toHaveCount(0);
  });

  test("register page exposes the NewAPI native registration form", async ({
    page,
  }) => {
    await page.goto("/register");

    await expect(page.getByRole("heading", { name: "注册" })).toBeVisible();
    await expect(page.getByLabel("邮箱", { exact: true })).toBeVisible();
    await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
    await expect(page.getByLabel("邀请码（可选）")).toBeVisible();
    await expect(
      page.getByLabel("邮箱验证码（如 NewAPI 要求）"),
    ).toBeVisible();
    await expect(
      page.getByLabel("Turnstile Token（如 NewAPI 要求）"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "创建账户" })).toBeVisible();
    await expect(page.getByRole("link", { name: "登录" })).toHaveAttribute(
      "href",
      "/login",
    );

    await expect(
      page.getByRole("button", { name: /github|oauth|google/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /github|oauth|google/i }),
    ).toHaveCount(0);
  });

  test("anonymous dashboard access redirects to login", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  });

  test("configured upstream account can log in and use protected portal pages", async ({
    page,
  }) => {
    test.skip(
      !identifier || !password,
      "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD to run the login smoke test.",
    );

    const failedResponses: string[] = [];
    const browserErrors: string[] = [];

    page.on("response", (response) => {
      if (response.status() >= 500) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(message.text());
      }
    });

    await page.goto("/login");
    await page.getByLabel("邮箱或用户名").fill(identifier!);
    await page.getByLabel("密码").fill(password!);
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("客户控制台")).toBeVisible();
    await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
    await expect(page.getByText("概览加载失败")).toHaveCount(0);
    await expect(page.getByText(/NewAPI 已绑定|NewAPI 绑定处理中/)).toBeVisible();

    const me = await page.request.get("/api/auth/me");
    const mePayload = await me.json();
    expect(me.ok()).toBeTruthy();
    expect(mePayload).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          user: expect.objectContaining({
            id: expect.any(String),
            newApiBinding: "ready",
            newApiUserId: expect.any(String),
          }),
        }),
      }),
    );

    const summary = await page.request.get("/api/dashboard/summary");
    expect(summary.status()).toBeLessThan(500);
    expect(summary.ok()).toBeTruthy();

    const tokens = await page.request.get("/api/tokens?p=1&size=10");
    expect(tokens.status()).toBeLessThan(500);
    expect(tokens.ok()).toBeTruthy();

    const usage = await page.request.get("/api/usage?default_time=day");
    expect(usage.status()).toBeLessThan(500);
    expect(usage.ok()).toBeTruthy();

    const logs = await page.request.get("/api/logs?p=1&page_size=10");
    expect(logs.status()).toBeLessThan(500);
    expect(logs.ok()).toBeTruthy();

    await page.goto("/dashboard/tokens");
    await expect(page.getByRole("heading", { name: "Tokens" })).toBeVisible();
    await expect(page.getByText("Token 列表加载失败")).toHaveCount(0);

    await page.goto("/dashboard/usage");
    await expect(page.getByRole("heading", { name: "用量" })).toBeVisible();
    await expect(page.getByText("用量加载失败")).toHaveCount(0);

    expect(failedResponses).toEqual([]);
    expect(browserErrors).toEqual([]);
  });
});
