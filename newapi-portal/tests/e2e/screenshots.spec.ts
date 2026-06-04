import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const identifier = process.env.E2E_PORTAL_IDENTIFIER ?? "scr@easyapi.work";
const password = process.env.E2E_PORTAL_PASSWORD ?? "ScreenshotTest123!";

/** 默认按日期分目录；设置 E2E_SCREENSHOT_RUN_ID 可写入独立子目录，避免覆盖同日旧图。 */
const screenshotDate = new Date().toISOString().slice(0, 10);
const screenshotRunId = process.env.E2E_SCREENSHOT_RUN_ID?.trim();
const screenshotDir = path.join(
  process.cwd(),
  "screenshots",
  screenshotRunId ? `${screenshotDate}-${screenshotRunId}` : screenshotDate,
);

const PUBLIC_ROUTES = [
  { slug: "home", path: "/", heading: "管令牌、看用量、随时充值", level: 1 as const },
  { slug: "login", path: "/login", heading: "欢迎回来" },
  { slug: "register", path: "/register", heading: "创建账户" },
] as const;

const AUTH_ROUTES = [
  { slug: "dashboard", path: "/dashboard", heading: "概览", level: 1 as const },
  { slug: "dashboard-tokens", path: "/dashboard/tokens", heading: "令牌", level: 1 as const },
  { slug: "dashboard-billing", path: "/dashboard/billing", text: "充值金额" },
  { slug: "dashboard-usage", path: "/dashboard/usage", heading: "用量", level: 1 as const },
] as const;

type RouteMarker =
  | { heading: string; level?: 1; text?: never }
  | { text: string; heading?: never; level?: never };

function pageReady(page: Page, route: RouteMarker) {
  if ("text" in route && route.text) {
    return page.getByText(route.text).first();
  }
  const heading = route.heading!;
  return route.level
    ? page.getByRole("heading", { level: route.level, name: heading })
    : page.getByRole("heading", { name: heading });
}

test.describe.configure({ mode: "serial" });

test.describe("Full-site screenshots", () => {
  test.setTimeout(120_000);
  test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
  });

  for (const route of PUBLIC_ROUTES) {
    test(`screenshot ${route.path}`, async ({ page }) => {
      await page.goto(route.path);
      await expect(pageReady(page, route)).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState("load");
      await page.screenshot({
        path: path.join(screenshotDir, `${route.slug}.png`),
        fullPage: true,
      });
    });
  }

  test("login and screenshot dashboard pages", async ({ page }) => {
    test.skip(
      !identifier || !password,
      "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD to capture authenticated pages.",
    );

    await page.goto("/login");
    await page.getByLabel("邮箱或用户名").fill(identifier);
    await page.getByRole("textbox", { name: "密码" }).fill(password);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(pageReady(page, { heading: "概览", level: 1 })).toBeVisible();

    for (const route of AUTH_ROUTES) {
      await page.goto(route.path);
      await expect(pageReady(page, route)).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState("load");
      await page.screenshot({
        path: path.join(screenshotDir, `${route.slug}.png`),
        fullPage: true,
      });
    }
  });
});