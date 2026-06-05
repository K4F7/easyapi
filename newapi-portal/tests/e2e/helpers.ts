import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  expect,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test";

import { isBenign404 } from "./routes";

export const E2E_IDENTIFIER = process.env.E2E_PORTAL_IDENTIFIER;
export const E2E_PASSWORD = process.env.E2E_PORTAL_PASSWORD;

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const authStatePath =
  process.env.E2E_AUTH_STATE_FILE ??
  path.join(process.cwd(), ".auth", "e2e-dashboard.json");
const failedResponseTasks = new WeakMap<string[], Promise<void>[]>();

let cachedAuthState: StorageState | undefined;
let authStateRead: Promise<StorageState | undefined> | undefined;

export function attachPageDiagnostics(
  page: Page,
  failedResponses: string[],
  notFoundResponses: string[],
  browserErrors: string[],
) {
  const tasks = failedResponseTasks.get(failedResponses) ?? [];
  failedResponseTasks.set(failedResponses, tasks);

  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 500) {
      const task = formatFailedResponse(response).then((entry) => {
        failedResponses.push(entry);
      });
      tasks.push(task);
    } else if (status === 404 && !isBenign404(url)) {
      notFoundResponses.push(url);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
}

async function readCachedAuthState(): Promise<StorageState | undefined> {
  if (cachedAuthState) {
    return cachedAuthState;
  }
  authStateRead ??= readFile(authStatePath, "utf8")
    .then((content) => JSON.parse(content) as StorageState)
    .catch(() => undefined);
  cachedAuthState = await authStateRead;
  return cachedAuthState;
}

async function persistAuthState(context: BrowserContext) {
  cachedAuthState = await context.storageState();
  await mkdir(path.dirname(authStatePath), { recursive: true });
  await writeFile(authStatePath, JSON.stringify(cachedAuthState), "utf8");
}

async function applyAuthState(page: Page, state: StorageState) {
  if (state.cookies.length > 0) {
    await page.context().addCookies(state.cookies);
  }
  if (state.origins.length > 0) {
    await page.addInitScript((origins: StorageState["origins"]) => {
      const originState = origins.find(
        (origin) => origin.origin === window.location.origin,
      );
      if (!originState) {
        return;
      }
      for (const item of originState.localStorage) {
        window.localStorage.setItem(item.name, item.value);
      }
    }, state.origins);
  }
}

export async function loginToDashboard(page: Page) {
  await page.goto("/login");
  await page.getByLabel("邮箱或用户名").fill(E2E_IDENTIFIER!);
  await page.getByRole("textbox", { name: "密码" }).fill(E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await persistAuthState(page.context());
}

/** Reuse an existing session when possible to avoid hammering /api/auth/login. */
export async function ensureDashboardSession(page: Page) {
  const authState = await readCachedAuthState();
  if (authState) {
    await applyAuthState(page, authState);
  }

  await page.goto("/dashboard");
  if (/\/login/.test(page.url())) {
    await loginToDashboard(page);
    return;
  }
  await expect(
    page.getByRole("heading", { name: "概览", level: 1 }),
  ).toBeVisible({
    timeout: 20_000,
  });
}

export async function assertNoClientErrors(
  failedResponses: string[],
  notFoundResponses: string[],
  browserErrors: string[],
) {
  await Promise.allSettled(failedResponseTasks.get(failedResponses) ?? []);
  expect(failedResponses).toEqual([]);
  expect(notFoundResponses).toEqual([]);
  expect(browserErrors).toEqual([]);
}

async function formatFailedResponse(response: Response): Promise<string> {
  const status = response.status();
  const url = response.url();
  const body = await responseBodySummary(response);
  return `${status} ${url}\nbody: ${body}`;
}

async function responseBodySummary(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text.trim()) {
      return "<empty>";
    }

    try {
      return JSON.stringify(redactJson(JSON.parse(text))).slice(0, 1_000);
    } catch {
      return redactText(text).replace(/\s+/g, " ").trim().slice(0, 1_000);
    }
  } catch (error) {
    return `<unavailable: ${redactText((error as Error).message)}>`;
  }
}

function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /authorization|cookie|password|secret|token|api[-_]?key|session/i.test(
          key,
        )
          ? "[redacted]"
          : redactJson(entry),
      ]),
    );
  }
  return typeof value === "string" ? redactText(value) : value;
}

function redactText(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]")
    .replace(
      /portal-image-session-v1\.[A-Za-z0-9._-]+/g,
      "portal-image-session-v1.[redacted]",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [redacted]")
    .replace(
      /(password|secret|token|api[-_]?key|authorization|cookie)=([^&\s]+)/gi,
      "$1=[redacted]",
    );
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
