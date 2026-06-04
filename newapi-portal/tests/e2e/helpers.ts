import { expect, type Page } from "@playwright/test";

import { isBenign404 } from "./routes";

export const E2E_IDENTIFIER = process.env.E2E_PORTAL_IDENTIFIER;
export const E2E_PASSWORD = process.env.E2E_PORTAL_PASSWORD;

export function attachPageDiagnostics(
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

export async function loginToDashboard(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/login");
    await page.getByLabel("邮箱或用户名").fill(E2E_IDENTIFIER!);
    await page.getByRole("textbox", { name: "密码" }).fill(E2E_PASSWORD!);
    await page.getByRole("button", { name: "登录" }).click();
    try {
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(1_500);
    }
  }
}

/** Reuse an existing session when possible to avoid hammering /api/auth/login. */
export async function ensureDashboardSession(page: Page) {
  await page.goto("/dashboard");
  if (/\/login/.test(page.url())) {
    await loginToDashboard(page);
    return;
  }
  await expect(page.getByRole("heading", { name: "概览", level: 1 })).toBeVisible({
    timeout: 20_000,
  });
}

export function assertNoClientErrors(
  failedResponses: string[],
  notFoundResponses: string[],
  browserErrors: string[],
) {
  expect(failedResponses).toEqual([]);
  expect(notFoundResponses).toEqual([]);
  expect(browserErrors).toEqual([]);
}

/** OpenAI-compatible SSE body for mocked playground chat streams. */
export function mockChatSseBody(parts: {
  deltas?: string[];
  totalTokens?: number;
}): string {
  const lines: string[] = [];
  for (const content of parts.deltas ?? ["流", "式", "回复"]) {
    lines.push(
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
    );
  }
  if (parts.totalTokens !== undefined) {
    lines.push(
      `data: ${JSON.stringify({ usage: { total_tokens: parts.totalTokens } })}\n\n`,
    );
  }
  lines.push("data: [DONE]\n\n");
  return lines.join("");
}
