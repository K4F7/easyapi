import { expect, test } from "@playwright/test";

import {
  E2E_IDENTIFIER,
  E2E_PASSWORD,
  loginThroughPortalForm,
} from "./helpers";

test.describe("Dashboard affiliate UI", () => {
  test("shows invite link and transfer controls on overview", async ({
    page,
  }) => {
    test.skip(
      !E2E_IDENTIFIER || !E2E_PASSWORD,
      "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD to run dashboard affiliate e2e.",
    );

    await page.route("**/api/aff", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              aff_code: "E2ETEST",
              aff_count: 1,
              aff_quota: 5000,
              aff_history_quota: 5000,
            },
          }),
        });
        return;
      }

      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              transferred: true,
              transferred_quota: 5000,
              aff_quota: 0,
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await loginThroughPortalForm(page);
    await expect(page.getByRole("heading", { name: "概览", level: 1 })).toBeVisible();

    const affSection = page.getByTestId("affiliate-section");
    await expect(affSection).toBeVisible();
    await expect(affSection.getByText("邀请返利")).toBeVisible();
    await expect(page.getByLabel("邀请链接")).toHaveValue(/aff_code=E2ETEST/);
    await expect(
      page.getByRole("button", { name: "划转到可用余额" }),
    ).toBeEnabled();

    await page.getByRole("button", { name: "划转到可用余额" }).click();
    await expect(page.getByText("划转成功")).toBeVisible();
  });
});
