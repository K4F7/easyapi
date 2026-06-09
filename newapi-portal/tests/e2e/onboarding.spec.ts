import { expect, test, type Page } from "@playwright/test";

import {
  E2E_IDENTIFIER,
  E2E_PASSWORD,
  ensureDashboardSession,
  shouldSkipUnauthenticatedCiProject,
} from "./helpers";

async function mockDashboardSummary(page: Page) {
  await page.route("**/api/dashboard/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          user: {
            email: "onboarding@example.com",
            inviteCode: "INVITE",
            newApiBinding: "ready",
          },
          newApi: {
            binding: "ready",
            status: "ready",
            self: {
              quota: 1000000,
              used_quota: 10000,
              request_count: 12,
            },
          },
          tokens: {
            count: 0,
            status: "ready",
          },
          usage: {
            today: {
              totals: {
                quota: 1000,
                count: 2,
                tokenUsed: 300,
              },
            },
            week: {
              totals: {
                quota: 7000,
                count: 14,
                tokenUsed: 2100,
              },
            },
          },
          logStats: {
            rpm: 1,
            tpm: 100,
            status: "ready",
          },
          checkin: {
            checkedInToday: false,
            checkedInOn: "2026-06-08",
            status: "AVAILABLE",
            quotaApplied: null,
            quotaPending: false,
          },
        },
      }),
    });
  });
}

async function loginWithFreshOnboarding(
  page: Page,
  projectName: string,
) {
  test.skip(
    shouldSkipUnauthenticatedCiProject(projectName),
    "Authenticated specs run in authenticated-chromium on CI.",
  );
  test.skip(
    !E2E_IDENTIFIER || !E2E_PASSWORD,
    "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD to run onboarding E2E.",
  );

  await mockDashboardSummary(page);
  await ensureDashboardSession(page, { onboarding: "fresh" });
}

test.describe("onboarding tour", () => {
  test("first dashboard visit shows the onboarding tour", async ({
    page,
  }, testInfo) => {
    await loginWithFreshOnboarding(page, testInfo.project.name);

    await expect(page.getByTestId("onboarding-dialog")).toBeVisible();
    await expect(page.getByText("新手引导 1 / 3")).toBeVisible();
    await expect(page.getByRole("heading", { name: "复制接入信息" })).toBeVisible();
  });

  test("can skip onboarding and keep it dismissed", async ({
    page,
  }, testInfo) => {
    await loginWithFreshOnboarding(page, testInfo.project.name);

    await page.getByRole("button", { name: "跳过引导" }).click();
    await expect(page.getByTestId("onboarding-dialog")).toHaveCount(0);
    await expect(page.getByTestId("onboarding-restart")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("onboarding-dialog")).toHaveCount(0);
  });

  test("can restore the onboarding tour after skipping", async ({
    page,
  }, testInfo) => {
    await loginWithFreshOnboarding(page, testInfo.project.name);

    await page.getByRole("button", { name: "跳过引导" }).click();
    await page.getByTestId("onboarding-restart").click();

    await expect(page.getByTestId("onboarding-dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "复制接入信息" })).toBeVisible();
  });

  test("hides restart button after completing onboarding", async ({
    page,
  }, testInfo) => {
    await loginWithFreshOnboarding(page, testInfo.project.name);

    await page.getByTestId("onboarding-next").click();
    await page.getByTestId("onboarding-next").click();
    await page.getByTestId("onboarding-next").click();

    await expect(page.getByTestId("onboarding-dialog")).toHaveCount(0);
    await expect(page.getByTestId("onboarding-restart")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("onboarding-restart")).toHaveCount(0);
  });

  test("can dismiss restart button with hover close control", async ({
    page,
  }, testInfo) => {
    await loginWithFreshOnboarding(page, testInfo.project.name);

    await page.getByRole("button", { name: "跳过引导" }).click();
    const restartButton = page.getByTestId("onboarding-restart");
    await expect(restartButton).toBeVisible();

    await restartButton.hover();
    await page.getByTestId("onboarding-restart-dismiss").click();

    await expect(restartButton).toHaveCount(0);

    await page.reload();
    await expect(restartButton).toHaveCount(0);
  });

  test("steps cover access info, token creation, and playground", async ({
    page,
  }, testInfo) => {
    await loginWithFreshOnboarding(page, testInfo.project.name);

    const popover = page.getByTestId("onboarding-dialog");
    const accessCopy = page.locator('[data-onboarding-target="access-copy"]');

    await expect(accessCopy).toHaveClass(/onboarding-highlight/);
    await expectPopoverAnchoredNearTarget(page, popover, accessCopy);

    await page.getByTestId("onboarding-next").click();
    await expect(page.getByRole("heading", { name: "创建 API Token" })).toBeVisible();

    const tokenCreate = page.locator('[data-onboarding-target="token-create"]');
    await expect(tokenCreate).toHaveClass(/onboarding-highlight/);
    await expectPopoverAnchoredNearTarget(page, popover, tokenCreate);

    await page.getByTestId("onboarding-next").click();
    await expect(
      page.getByRole("heading", { name: "打开操练场验证调用" }),
    ).toBeVisible();

    const playgroundEntry = page.locator(
      '#dashboard-sidebar [data-onboarding-target="playground-entry"]',
    );
    await expect(playgroundEntry).toHaveClass(/onboarding-highlight/);
    await expectPopoverAnchoredNearTarget(page, popover, playgroundEntry);
  });
});

async function expectPopoverAnchoredNearTarget(
  page: Page,
  popover: ReturnType<Page["getByTestId"]>,
  target: ReturnType<Page["locator"]>,
) {
  const [popoverBox, targetBox] = await Promise.all([
    popover.boundingBox(),
    target.boundingBox(),
  ]);

  expect(popoverBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  if (!popoverBox || !targetBox) {
    return;
  }

  const horizontalGap = Math.max(
    targetBox.x - (popoverBox.x + popoverBox.width),
    popoverBox.x - (targetBox.x + targetBox.width),
    0,
  );
  const verticalGap = Math.max(
    targetBox.y - (popoverBox.y + popoverBox.height),
    popoverBox.y - (targetBox.y + targetBox.height),
    0,
  );
  const minEdgeDistance = Math.min(
    horizontalGap > 0 ? horizontalGap : Number.POSITIVE_INFINITY,
    verticalGap > 0 ? verticalGap : Number.POSITIVE_INFINITY,
    Math.abs(popoverBox.x + popoverBox.width - targetBox.x),
    Math.abs(targetBox.x + targetBox.width - popoverBox.x),
    Math.abs(popoverBox.y + popoverBox.height - targetBox.y),
    Math.abs(targetBox.y + targetBox.height - popoverBox.y),
  );

  expect(minEdgeDistance).toBeLessThan(48);
  expect(popoverBox.width).toBeLessThanOrEqual(320);
}
