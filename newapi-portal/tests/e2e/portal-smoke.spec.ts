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

    await expect(page.getByRole("button", { name: /github|oauth|google/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /github|oauth|google/i })).toHaveCount(0);
  });

  test("register page exposes the NewAPI native registration form", async ({
    page,
  }) => {
    await page.goto("/register");

    await expect(page.getByRole("heading", { name: "注册" })).toBeVisible();
    await expect(page.getByLabel("邮箱", { exact: true })).toBeVisible();
    await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
    await expect(page.getByLabel("邀请码（可选）")).toBeVisible();
    await expect(page.getByLabel("邮箱验证码（如 NewAPI 要求）")).toBeVisible();
    await expect(page.getByLabel("Turnstile Token（如 NewAPI 要求）")).toBeVisible();
    await expect(page.getByRole("button", { name: "创建账户" })).toBeVisible();
    await expect(page.getByRole("link", { name: "登录" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  test("anonymous dashboard access redirects to login", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  });

  test("configured test account can log in and open dashboard", async ({
    page,
  }) => {
    test.skip(
      !identifier || !password,
      "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD to run the login smoke test.",
    );

    await page.goto("/login");
    await page.getByLabel("邮箱或用户名").fill(identifier!);
    await page.getByLabel("密码").fill(password!);
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("客户控制台")).toBeVisible();
    await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();

    const summary = await page.request.get("/api/dashboard/summary");
    expect(summary.status()).toBeLessThan(500);
  });
});
