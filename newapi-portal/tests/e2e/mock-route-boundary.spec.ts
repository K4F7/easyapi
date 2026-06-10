import { expect, test, type Page, type Route } from "@playwright/test";

import {
  attachPageDiagnostics,
  assertNoClientErrors,
  shouldSkipAuthenticatedProject,
} from "./helpers";
import { AUTH_ROUTES, routeLocator } from "./routes";

const devMockEnabled = process.env.PORTAL_DEV_MOCK === "1";
const baseOrigin = new URL(
  process.env.E2E_BASE_URL ?? "https://test.easyapi.work",
).origin;

test.describe("Portal mocked route boundary", () => {
  test("renders authenticated shell routes without external API traffic", async ({
    page,
  }, testInfo) => {
    test.skip(
      shouldSkipAuthenticatedProject(testInfo.project.name),
      "Mocked route boundary coverage runs in the unauthenticated chromium project.",
    );
    test.skip(
      !devMockEnabled,
      "Set PORTAL_DEV_MOCK=1 to run the mocked shell route boundary sweep.",
    );

    const unexpectedExternalRequests: string[] = [];
    await blockUnexpectedExternalTraffic(page, unexpectedExternalRequests);

    const failedResponses: string[] = [];
    const notFoundResponses: string[] = [];
    const browserErrors: string[] = [];
    attachPageDiagnostics(
      page,
      failedResponses,
      notFoundResponses,
      browserErrors,
    );

    const login = await page.request.post("/api/auth/login", {
      data: { identifier: "mock-route-sweep@example.com", password: "password" },
    });
    expect(login.ok()).toBe(true);

    for (const route of AUTH_ROUTES) {
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
    expect(unexpectedExternalRequests).toEqual([]);
  });
});

async function blockUnexpectedExternalTraffic(
  page: Page,
  unexpectedExternalRequests: string[],
) {
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());

    if (requestUrl.origin === baseOrigin) {
      await route.continue();
      return;
    }

    unexpectedExternalRequests.push(`${route.request().method()} ${requestUrl.href}`);
    await abortRoute(route);
  });
}

async function abortRoute(route: Route) {
  try {
    await route.abort("blockedbyclient");
  } catch {
    // Navigation may already have completed; the recorded URL is the assertion.
  }
}
