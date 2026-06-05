import { expect, type Page, type Response } from "@playwright/test";

import { isBenign404 } from "./routes";

export const E2E_IDENTIFIER = process.env.E2E_PORTAL_IDENTIFIER;
export const E2E_PASSWORD = process.env.E2E_PORTAL_PASSWORD;

export async function ensureDashboardSession(page: Page) {
  expect(E2E_IDENTIFIER, "E2E_PORTAL_IDENTIFIER is required").toBeTruthy();
  expect(E2E_PASSWORD, "E2E_PORTAL_PASSWORD is required").toBeTruthy();

  await page.goto("/login");
  await page.getByLabel(/邮箱|用户名|邮箱或用户名/).fill(E2E_IDENTIFIER ?? "");
  await page.getByLabel("密码", { exact: true }).fill(E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: /登录|进入/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

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
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
}

export async function assertNoClientErrors(
  failedResponses: string[],
  notFoundResponses: string[],
  browserErrors: string[],
) {
  expect(failedResponses, "No 5xx responses expected").toEqual([]);
  expect(notFoundResponses, "No unexpected 404 responses expected").toEqual([]);
  expect(browserErrors, "No browser errors expected").toEqual([]);
}

export function mockChatSseBody({
  content = "pong",
  deltas,
  totalTokens,
  usage,
}: {
  content?: string;
  deltas?: string[];
  totalTokens?: number;
  usage?: Record<string, number>;
} = {}) {
  const usagePayload = usage ?? (totalTokens ? { total_tokens: totalTokens } : undefined);
  const textChunks = deltas ?? [content];
  const chunks = [
    ...textChunks.map((delta) => ({
      choices: [{ delta: { content: delta }, finish_reason: null }],
    })),
    {
      choices: [{ delta: {}, finish_reason: "stop" }],
      usage: usagePayload,
    },
  ];
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
}

export async function readJsonResponse(response: Response) {
  return response.json().catch(() => undefined);
}
