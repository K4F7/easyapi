import { expect, test } from "@playwright/test";

import {
  attachPageDiagnostics,
  assertNoClientErrors,
  ensureDashboardSession,
} from "./helpers";
import { AUTH_ROUTES, routeLocator } from "./routes";

const identifier = process.env.E2E_PORTAL_IDENTIFIER;
const password = process.env.E2E_PORTAL_PASSWORD;

test.describe("NewAPI Portal smoke", () => {
  test("health endpoint reports the portal service as OK", async ({
    request,
  }) => {
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

    await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
    await expect(page.getByLabel("邮箱或用户名")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "密码" })).toBeVisible();
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "免费创建账户" }),
    ).toHaveAttribute("href", "/register");

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
    await expect(page.getByLabel("用户名")).toBeVisible();
    await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
    await expect(page.getByLabel("确认密码")).toBeVisible();
    await expect(page.getByLabel("邮箱")).toBeVisible();
    await expect(page.getByLabel("验证码")).toBeVisible();
    await expect(page.getByLabel(/邀请码/)).toBeVisible();
    await expect(page.getByText(/服务条款|隐私政策|我同意/)).toHaveCount(0);
    await page.goto("/register?inviteCode=ABC123");
    await expect(
      page.getByRole("button", { name: "获取验证码" }),
    ).toBeDisabled();
    await page.getByLabel("邮箱").fill("user@example.com");
    await expect(
      page.getByRole("button", { name: "获取验证码" }),
    ).toBeEnabled();
    await expect(page.getByLabel(/turnstile/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "注册", exact: true })).toBeEnabled();

    await page.route("**/api/auth/verification", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { status: "SENT" },
        }),
      });
    });
    await page.getByRole("button", { name: "获取验证码" }).click();
    await expect(page.getByText(/验证码已发送/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^\d+s$/ })).toBeVisible();

    const registerRequests: Array<Record<string, unknown>> = [];
    await page.route("**/api/auth/register", async (route) => {
      registerRequests.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { message: "ok" },
        }),
      });
    });

    await page.getByLabel("用户名").fill("testuser");
    await page.getByLabel("密码", { exact: true }).fill("MyPassword8!");
    await page.getByLabel("确认密码").fill("MyPassword8!");
    await page.getByLabel("验证码").fill("654321");
    await page.getByRole("button", { name: "注册", exact: true }).click();
    expect(registerRequests).toEqual([
      expect.objectContaining({
        username: "testuser",
        email: "user@example.com",
        password: "MyPassword8!",
        inviteCode: "ABC123",
        verificationCode: "654321",
      }),
    ]);
    expect(registerRequests[0]).not.toHaveProperty("turnstile");
    expect(registerRequests[0]).not.toHaveProperty("acceptedTerms");
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
    await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  });

  test("configured upstream account can log in and use protected portal pages", async ({
    page,
  }) => {
    test.skip(
      !identifier || !password,
      "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD to run the login smoke test.",
    );

    const failedResponses: string[] = [];
    const notFoundResponses: string[] = [];
    const browserErrors: string[] = [];

    attachPageDiagnostics(
      page,
      failedResponses,
      notFoundResponses,
      browserErrors,
    );

    await ensureDashboardSession(page);
    await expect(page.getByText("客户控制台")).toBeVisible();
    await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
    await expect(page.getByText("概览加载失败")).toHaveCount(0);

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

    for (const route of AUTH_ROUTES) {
      if (route.path === "/dashboard") {
        continue;
      }
      await page.goto(route.path);
      await expect(routeLocator(page, route.marker)).toBeVisible();
      if (route.errorTexts?.length) {
        for (const text of route.errorTexts) {
          await expect(page.getByText(text)).toHaveCount(0);
        }
      }
    }

    await assertNoClientErrors(
      failedResponses,
      notFoundResponses,
      browserErrors,
    );
  });
});
