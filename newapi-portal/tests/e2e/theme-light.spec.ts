import { expect, test } from "@playwright/test";

import {
  E2E_IDENTIFIER,
  E2E_PASSWORD,
  ensureDashboardSession,
  shouldSkipAuthenticatedProject,
  shouldSkipUnauthenticatedCiProject,
} from "./helpers";

const LIGHT_BACKGROUND_MIN_LUMINANCE = 0.85;

async function mockDashboardApis(page: import("@playwright/test").Page) {
  await page.route("**/api/dashboard/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          quotaConfig: { quotaPerCny: 500_000, source: "default" },
          user: {
            email: "theme-light@example.com",
            newApiBinding: "ready",
          },
          newApi: {
            binding: "ready",
            status: "ready",
            self: {
              quota: 1_000_000,
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

function rgbChannels(color: string) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  expect(match, `Expected an rgb() color, got ${color}`).toBeTruthy();
  return match!.slice(1, 4).map(Number);
}

function expectLightColor(color: string) {
  const [red, green, blue] = rgbChannels(color);
  expect(relativeLuminance(red, green, blue)).toBeGreaterThanOrEqual(
    LIGHT_BACKGROUND_MIN_LUMINANCE,
  );
}

function relativeLuminance(red: number, green: number, blue: number) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test.describe("Portal light theme", () => {
  test.use({ colorScheme: "dark" });

  test("keeps html and public portal pages light under dark OS", async ({
    page,
  }, testInfo) => {
    test.skip(
      shouldSkipAuthenticatedProject(testInfo.project.name),
      "Public theme coverage runs in chromium.",
    );

    await page.goto("/");

    const themeState = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const htmlStyles = getComputedStyle(html);
      const bodyStyles = getComputedStyle(body);

      return {
        htmlClassName: html.className,
        htmlDatasetTheme: html.dataset.theme,
        htmlColorScheme: htmlStyles.colorScheme,
        bodyBackground: bodyStyles.backgroundColor,
      };
    });

    expect(themeState.htmlClassName).not.toContain("dark");
    expect(themeState.htmlDatasetTheme).toBe("light");
    expect(themeState.htmlColorScheme).toBe("light");
    expectLightColor(themeState.bodyBackground);
  });

  test("keeps dashboard pages and toast light under dark OS", async ({
    page,
  }, testInfo) => {
    test.skip(
      shouldSkipUnauthenticatedCiProject(testInfo.project.name),
      "Authenticated specs run in authenticated-chromium on CI.",
    );
    test.skip(
      !E2E_IDENTIFIER || !E2E_PASSWORD,
      "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD.",
    );

    await mockDashboardApis(page);
    await ensureDashboardSession(page);

    const dashboardThemeState = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const appRoot = document.querySelector(".min-h-screen");
      const bodyStyles = getComputedStyle(body);
      const rootStyles = appRoot ? getComputedStyle(appRoot) : null;

      return {
        htmlClassName: html.className,
        htmlColorScheme: getComputedStyle(html).colorScheme,
        bodyBackground: bodyStyles.backgroundColor,
        rootBackground: rootStyles?.backgroundColor ?? "",
      };
    });

    expect(dashboardThemeState.htmlClassName).not.toContain("dark");
    expect(dashboardThemeState.htmlColorScheme).toBe("light");
    expectLightColor(dashboardThemeState.bodyBackground);
    expectLightColor(dashboardThemeState.rootBackground);

    await page
      .getByRole("button", { name: "一键复制" })
      .click({ timeout: 15_000 });

    const toast = page.locator("[data-sonner-toast]").first();
    const toaster = page.locator("[data-sonner-toaster]").first();
    await expect(toast).toBeVisible();
    await expect(toaster).toHaveAttribute("data-theme", "light");

    const toastBackground = await toast.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expectLightColor(toastBackground);
  });
});
