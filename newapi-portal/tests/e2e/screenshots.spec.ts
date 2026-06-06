import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const identifier = process.env.E2E_PORTAL_IDENTIFIER ?? "scr@easyapi.work";
const password = process.env.E2E_PORTAL_PASSWORD ?? "ScreenshotTest123!";

const screenshotDir = path.join(
  process.cwd(),
  "screenshots",
  new Date().toISOString().slice(0, 10),
);

const PUBLIC_ROUTES = [
  { slug: "home", path: "/", heading: "管令牌、看用量、随时充值", level: 1 as const },
  { slug: "login", path: "/login", heading: "登录" },
  { slug: "register", path: "/register", heading: "注册" },
] as const;

const AUTH_ROUTES = [
  { slug: "dashboard", path: "/dashboard", heading: "概览", level: 1 as const },
  { slug: "dashboard-tokens", path: "/dashboard/tokens", heading: "令牌", level: 1 as const },
  { slug: "dashboard-billing", path: "/dashboard/billing", heading: "充值", level: 1 as const },
  { slug: "dashboard-usage", path: "/dashboard/usage", heading: "用量", level: 1 as const },
  { slug: "dashboard-profile", path: "/dashboard/profile", heading: "设置", level: 1 as const },
] as const;

function pageHeading(page: Page, route: { heading: string; level?: 1 }) {
  return route.level
    ? page.getByRole("heading", { level: route.level, name: route.heading })
    : page.getByRole("heading", { name: route.heading });
}

test.describe.configure({ mode: "serial" });

test.describe("Full-site screenshots", () => {
  test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
  });

  for (const route of PUBLIC_ROUTES) {
    test(`screenshot ${route.path}`, async ({ page }) => {
      await page.goto(route.path);
      await expect(pageHeading(page, route)).toBeVisible();
      await page.waitForLoadState("networkidle");
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
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(pageHeading(page, { heading: "概览", level: 1 })).toBeVisible();

    for (const route of AUTH_ROUTES) {
      await page.goto(route.path);
      await expect(pageHeading(page, route)).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: path.join(screenshotDir, `${route.slug}.png`),
        fullPage: true,
      });
    }
  });
});