import { expect, test } from "@playwright/test";

test.describe("Register page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/register");
    await expect(
      page.getByRole("heading", { name: "免费创建账户" }),
    ).toBeVisible();
  });

  test("shows email, passwords, verification code, and invite code fields", async ({
    page,
  }) => {
    await expect(page.getByLabel("用户名")).toBeVisible();
    await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
    await expect(page.getByLabel("确认密码")).toBeVisible();
    await expect(page.getByLabel("邮箱")).toBeVisible();
    await expect(page.getByLabel("验证码")).toBeVisible();
    await expect(page.getByLabel(/邀请码/)).toBeVisible();
    await expect(page.getByText(/服务条款|隐私政策|我同意/)).toHaveCount(0);
  });

  test("validates password length, confirmation, and verification code", async ({
    page,
  }) => {
    await page.getByLabel("用户名").fill("testuser");
    await page.getByLabel("邮箱").fill("user@example.com");
    await page.getByLabel("密码", { exact: true }).fill("short");
    await page.getByLabel("确认密码").fill("other");
    await page.getByRole("button", { name: "注册", exact: true }).click();

    await expect(page.getByText("密码至少需要 8 位")).toBeVisible();
    await expect(page.getByText("两次输入的密码不一致")).toBeVisible();
    await expect(page.getByText("请输入验证码")).toBeVisible();
  });

  test("register body omits acceptedTerms; aff_code from URL is submitted", async ({
    page,
  }) => {
    await page.goto("/register?aff_code=ABC123");
    await page.getByLabel("用户名").fill("testuser");
    await page.getByLabel("邮箱").fill("user@example.com");
    await page.getByLabel("密码", { exact: true }).fill("MyPassword8!");
    await page.getByLabel("确认密码").fill("MyPassword8!");
    await page.getByLabel("验证码").fill("654321");

    const registerRequests: Array<Record<string, unknown>> = [];
    await page.route("**/api/auth/register", async (route) => {
      registerRequests.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { message: "ok" } }),
      });
    });

    await page.getByRole("button", { name: "注册", exact: true }).click();
    expect(registerRequests[0]).toEqual(
      expect.objectContaining({
        username: "testuser",
        email: "user@example.com",
        password: "MyPassword8!",
        verificationCode: "654321",
        affCode: "ABC123",
      }),
    );
    expect(registerRequests[0]).not.toHaveProperty("acceptedTerms");
    expect(registerRequests[0]).not.toHaveProperty("inviteCode");
  });

  test("legacy inviteCode query is still accepted for one release cycle", async ({
    page,
  }) => {
    await page.goto("/register?inviteCode=LEGACY99");
    await page.getByLabel("用户名").fill("testuser");
    await page.getByLabel("邮箱").fill("user@example.com");
    await page.getByLabel("密码", { exact: true }).fill("MyPassword8!");
    await page.getByLabel("确认密码").fill("MyPassword8!");
    await page.getByLabel("验证码").fill("654321");

    const registerRequests: Array<Record<string, unknown>> = [];
    await page.route("**/api/auth/register", async (route) => {
      registerRequests.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { message: "ok" } }),
      });
    });

    await page.getByRole("button", { name: "注册", exact: true }).click();
    expect(registerRequests[0]).toEqual(
      expect.objectContaining({
        affCode: "LEGACY99",
      }),
    );
    expect(registerRequests[0]).not.toHaveProperty("inviteCode");
  });

  test("legacy aff query is not used for invite link format", async ({
    page,
  }) => {
    await page.goto("/register?aff=OLDSTYLE");
    const registerRequests: Array<Record<string, unknown>> = [];
    await page.route("**/api/auth/register", async (route) => {
      registerRequests.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { message: "ok" } }),
      });
    });

    await page.getByLabel("用户名").fill("testuser");
    await page.getByLabel("邮箱").fill("user@example.com");
    await page.getByLabel("密码", { exact: true }).fill("MyPassword8!");
    await page.getByLabel("确认密码").fill("MyPassword8!");
    await page.getByLabel("验证码").fill("111222");
    await page.getByRole("button", { name: "注册", exact: true }).click();

    expect(registerRequests[0]?.inviteCode).toBeUndefined();
  });

  test("register page does not link to terms or privacy flows", async ({
    page,
  }) => {
    await expect(
      page.getByRole("link", { name: /服务条款|隐私政策|terms|privacy/i }),
    ).toHaveCount(0);
    const hrefs = await page
      .getByRole("link")
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute("href") ?? ""),
      );
    expect(hrefs.some((href) => /\/terms|\/privacy/.test(href))).toBe(false);
  });
});
