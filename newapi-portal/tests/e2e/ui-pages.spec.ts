import { expect, test, type Page } from "@playwright/test";

import {
  AUTH_ROUTES,
  isBenign404,
  PUBLIC_ROUTES,
  routeLocator,
} from "./routes";
import { ensureDashboardSession } from "./helpers";

const identifier = process.env.E2E_PORTAL_IDENTIFIER;
const password = process.env.E2E_PORTAL_PASSWORD;

function attachPageDiagnostics(
  page: Page,
  failedResponses: string[],
  notFoundResponses: string[],
  browserErrors: string[],
) {
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 500) {
      failedResponses.push(`${status} ${url}`);
    } else if (status === 404 && !isBenign404(url)) {
      notFoundResponses.push(url);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
}

async function assertRouteHealthy(
  page: Page,
  path: string,
  marker: (typeof PUBLIC_ROUTES)[number]["marker"],
  errorTexts?: (string | RegExp)[],
) {
  await page.goto(path);
  await expect(routeLocator(page, marker)).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("load");

  if (errorTexts?.length) {
    for (const text of errorTexts) {
      await expect(page.getByText(text)).toHaveCount(0);
    }
  }
}

test.describe.configure({ mode: "serial" });

test.describe("Portal UI pages", () => {
  test.setTimeout(60_000);

  for (const route of PUBLIC_ROUTES) {
    test(`public page ${route.path} is usable`, async ({ page }) => {
      const failedResponses: string[] = [];
      const notFoundResponses: string[] = [];
      const browserErrors: string[] = [];
      attachPageDiagnostics(page, failedResponses, notFoundResponses, browserErrors);

      await assertRouteHealthy(page, route.path, route.marker, route.errorTexts);

      expect(failedResponses).toEqual([]);
      expect(notFoundResponses).toEqual([]);
      expect(browserErrors).toEqual([]);
    });
  }

  test("authenticated dashboard pages are usable", async ({ page }) => {
    test.skip(
      !identifier || !password,
      "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD to run authenticated UI checks.",
    );

    const failedResponses: string[] = [];
    const notFoundResponses: string[] = [];
    const browserErrors: string[] = [];
    attachPageDiagnostics(page, failedResponses, notFoundResponses, browserErrors);

    await ensureDashboardSession(page);

    for (const route of AUTH_ROUTES) {
      await assertRouteHealthy(page, route.path, route.marker, route.errorTexts);
      await expect(page).not.toHaveURL(/\/login$/);
    }

    expect(failedResponses).toEqual([]);
    expect(notFoundResponses).toEqual([]);
    expect(browserErrors).toEqual([]);
  });
});
