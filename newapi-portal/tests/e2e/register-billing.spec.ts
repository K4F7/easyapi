import { expect, test } from "@playwright/test";

import {
  attachPageDiagnostics,
  assertNoClientErrors,
  E2E_IDENTIFIER,
  E2E_PASSWORD,
  ensureDashboardSession,
} from "./helpers";

const identifier = E2E_IDENTIFIER;
const password = E2E_PASSWORD;

test.describe("Register page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "创建账户" })).toBeVisible();
  });

  test("shows email, passwords, verification code, and invite code fields", async ({
    page,
  }) => {
    await expect(page.getByLabel("邮箱地址")).toBeVisible();
    await expect(page.getByLabel("登录密码")).toBeVisible();
    await expect(page.getByLabel("确认密码")).toBeVisible();
    await expect(page.getByLabel("验证码")).toBeVisible();
    await expect(page.getByLabel(/邀请码/)).toBeVisible();
    await expect(page.getByText(/服务条款|隐私政策|我同意/)).toHaveCount(0);
  });

  test("validates password length, confirmation, and verification code", async ({
    page,
  }) => {
    await page.getByLabel("邮箱地址").fill("user@example.com");
    await page.getByLabel("登录密码").fill("short");
    await page.getByLabel("确认密码").fill("other");
    await page.getByRole("button", { name: "完成注册" }).click();

    await expect(page.getByText("密码至少 8 位")).toBeVisible();
    await expect(page.getByText("两次输入的密码不一致")).toBeVisible();
    await expect(page.getByText("请输入收到的验证码")).toBeVisible();
  });

  test("register body omits acceptedTerms; inviteCode from URL is submitted", async ({
    page,
  }) => {
    await page.goto("/register?inviteCode=ABC123");
    await page.getByLabel("邮箱地址").fill("user@example.com");
    await page.getByLabel("登录密码").fill("MyPassword8!");
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

    await page.getByRole("button", { name: "完成注册" }).click();
    expect(registerRequests[0]).toEqual(
      expect.objectContaining({
        email: "user@example.com",
        password: "MyPassword8!",
        verificationCode: "654321",
        inviteCode: "ABC123",
      }),
    );
    expect(registerRequests[0]).not.toHaveProperty("acceptedTerms");
  });

  test("legacy aff query is not used for invite link format", async ({ page }) => {
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

    await page.getByLabel("邮箱地址").fill("user@example.com");
    await page.getByLabel("登录密码").fill("MyPassword8!");
    await page.getByLabel("确认密码").fill("MyPassword8!");
    await page.getByLabel("验证码").fill("111222");
    await page.getByRole("button", { name: "完成注册" }).click();

    expect(registerRequests[0]?.inviteCode).toBeUndefined();
  });

  test("register page does not link to terms or privacy flows", async ({
    page,
  }) => {
    await expect(page.getByRole("link", { name: /服务条款|隐私政策|terms|privacy/i })).toHaveCount(
      0,
    );
    const hrefs = await page.getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
    expect(hrefs.some((href) => /\/terms|\/privacy/.test(href))).toBe(false);
  });
});

test.describe("Billing referral", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    test.skip(
      !identifier || !password,
      "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD.",
    );
    await ensureDashboardSession(page);
  });

  test("invite link uses inviteCode, copy button, steps, and reward tab", async ({
    page,
    context,
    browser,
  }) => {
    const failedResponses: string[] = [];
    const notFoundResponses: string[] = [];
    const browserErrors: string[] = [];
    attachPageDiagnostics(page, failedResponses, notFoundResponses, browserErrors);

    await page.goto("/dashboard/billing");
    await expect(page.getByText("充值金额")).toBeVisible({ timeout: 30_000 });
    await page.waitForResponse(
      (response) =>
        response.url().includes("/api/referral") && response.status() < 500,
      { timeout: 60_000 },
    );

    const inviteLine = page.locator(".font-mono.truncate").first();
    await expect(inviteLine).not.toHaveText("加载中...", { timeout: 60_000 });
    await expect(inviteLine).toContainText(/inviteCode=/, { timeout: 15_000 });
    const inviteUrl = (await inviteLine.innerText()).trim();
    expect(inviteUrl).toMatch(/\/register\?inviteCode=[A-Za-z0-9]+/);
    expect(inviteUrl).not.toMatch(/[?&]aff=/);

    await expect(page.getByText("累计已发奖励")).toBeVisible();
    await expect(page.getByText("待确认邀请")).toBeVisible();
    await expect(page.getByText("成功邀请")).toBeVisible();

    const pendingBlock = page
      .getByText("待确认邀请", { exact: true })
      .locator("..")
      .locator("..");
    await expect(pendingBlock).toContainText("人");
    await expect(pendingBlock).not.toContainText("¥");

    await expect(page.getByText("分享链接")).toBeVisible();
    await expect(page.getByText("好友注册")).toBeVisible();
    await expect(page.getByText("奖励到账")).toBeVisible();

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "复制" }).click();

    const guestContext = await browser.newContext();
    const registerPage = await guestContext.newPage();
    const registerTarget = inviteUrl.startsWith("http")
      ? inviteUrl
      : new URL(inviteUrl, "https://test.easyapi.work").toString();
    await registerPage.goto(registerTarget);
    await expect(registerPage.getByRole("heading", { name: "创建账户" })).toBeVisible();

    const code = new URL(inviteUrl).searchParams.get("inviteCode");
    expect(code).toBeTruthy();

    const registerRequests: Array<Record<string, unknown>> = [];
    await registerPage.route("**/api/auth/register", async (route) => {
      registerRequests.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { message: "ok" } }),
      });
    });

    await registerPage.getByLabel("邮箱地址").fill("invitee@example.com");
    await registerPage.getByLabel("登录密码").fill("InvitePass99!");
    await registerPage.getByLabel("确认密码").fill("InvitePass99!");
    await registerPage.getByLabel("验证码").fill("123456");
    await registerPage.getByRole("button", { name: "完成注册" }).click();
    expect(registerRequests[0]?.inviteCode).toBe(code);
    await guestContext.close();

    await page.getByRole("tab", { name: "奖励记录" }).click();
    await expect(
      page.getByText(/奖励|暂无奖励|流水/).first(),
    ).toBeVisible({ timeout: 15_000 });

    assertNoClientErrors(failedResponses, notFoundResponses, browserErrors);
  });
});
