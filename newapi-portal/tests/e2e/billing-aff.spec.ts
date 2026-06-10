import { expect, test } from "@playwright/test";

import {
  E2E_IDENTIFIER,
  E2E_PASSWORD,
  ensureBillingSession,
  shouldSkipUnauthenticatedCiProject,
} from "./helpers";

const devMockEnabled = process.env.PORTAL_DEV_MOCK === "1";

const MOCK_AFF = {
  aff_code: "E2ETEST01",
  aff_count: 3,
  aff_quota: 500_000,
  aff_history_quota: 1_500_000,
};

async function mockBillingAffApis(page: import("@playwright/test").Page) {
  await page.route("**/api/dashboard/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          quotaConfig: { quotaPerCny: 500_000, source: "default" },
          newApi: {
            binding: "ready",
            status: "ready",
            self: {
              quota: 2_000_000,
              used_quota: 100_000,
            },
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

  await page.route("**/api/aff", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: MOCK_AFF }),
      });
      return;
    }

    await route.continue();
  });
}

test.describe("Billing affiliate section", () => {
  test("shows affiliate stats and invite link after login", async ({
    page,
  }, testInfo) => {
    test.skip(
      shouldSkipUnauthenticatedCiProject(testInfo.project.name),
      "Authenticated specs run in authenticated-chromium on CI.",
    );
    test.skip(
      !devMockEnabled && (!E2E_IDENTIFIER || !E2E_PASSWORD),
      "Set PORTAL_DEV_MOCK=1 or E2E_PORTAL_IDENTIFIER/E2E_PORTAL_PASSWORD.",
    );

    await mockBillingAffApis(page);
    if (devMockEnabled) {
      await page.request.post("/api/auth/login", {
        data: { identifier: "e2e@example.com", password: "any-password" },
      });
      await page.goto("/dashboard/billing");
    } else {
      await ensureBillingSession(page);
    }

    await expect(page.getByRole("heading", { name: "充值", level: 1 })).toBeVisible();
    const affSection = page.getByTestId("affiliate-section");
    await expect(affSection).toBeVisible();
    await expect(affSection.getByText("邀请返利")).toBeVisible();
    await expect(affSection.getByText("邀请人数")).toBeVisible();
    await expect(affSection.getByText("累计返利")).toBeVisible();
    await expect(affSection.getByText("可划转返利")).toBeVisible();
    await expect(
      affSection
        .locator("p", { hasText: "邀请人数" })
        .locator("..")
        .getByText("3", { exact: true }),
    ).toBeVisible();
    await expect(affSection.getByText("¥1.00")).toBeVisible();
    await expect(affSection.getByText("¥3.00")).toBeVisible();

    const inviteInput = page.locator("#billingInviteLink");
    await expect(inviteInput).not.toHaveValue("加载中…");
    await expect(inviteInput).toBeVisible();
    const inviteLink = await inviteInput.inputValue();
    expect(inviteLink).toContain("/register?aff_code=");
    expect(inviteLink).toContain(
      `aff_code=${encodeURIComponent(MOCK_AFF.aff_code)}`,
    );

    await expect(
      affSection.getByRole("button", { name: "划转到可用余额" }),
    ).toBeEnabled();
    await expect(affSection.getByRole("button", { name: "复制" })).toBeEnabled();
  });

  test("disables transfer when aff_quota is zero", async ({ page }, testInfo) => {
    test.skip(
      shouldSkipUnauthenticatedCiProject(testInfo.project.name),
      "Authenticated specs run in authenticated-chromium on CI.",
    );
    test.skip(
      !devMockEnabled && (!E2E_IDENTIFIER || !E2E_PASSWORD),
      "Set PORTAL_DEV_MOCK=1 or E2E_PORTAL_IDENTIFIER/E2E_PORTAL_PASSWORD.",
    );

    await page.route("**/api/dashboard/summary", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            quotaConfig: { quotaPerCny: 500_000, source: "default" },
            newApi: {
              binding: "ready",
              status: "ready",
              self: { quota: 2_000_000, used_quota: 100_000 },
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

    await page.route("**/api/aff", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            aff_code: "ZEROQUOTA",
            aff_count: 0,
            aff_quota: 0,
            aff_history_quota: 0,
          },
        }),
      });
    });

    if (devMockEnabled) {
      await page.request.post("/api/auth/login", {
        data: { identifier: "e2e@example.com", password: "any-password" },
      });
      await page.goto("/dashboard/billing");
    } else {
      await ensureBillingSession(page);
    }

    const affSection = page.getByTestId("affiliate-section");
    await expect(affSection).toBeVisible();
    await expect(
      affSection.getByRole("button", { name: "划转到可用余额" }),
    ).toBeDisabled();

    const inviteInput = page.locator("#billingInviteLink");
    await expect(inviteInput).not.toHaveValue("加载中…");
    const inviteLink = await inviteInput.inputValue();
    expect(inviteLink).toContain("aff_code=ZEROQUOTA");
  });
});
