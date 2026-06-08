import { expect, type APIResponse, type Page, type Response } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { isBenign404 } from "./routes";

export const E2E_IDENTIFIER = process.env.E2E_PORTAL_IDENTIFIER;
export const E2E_PASSWORD = process.env.E2E_PORTAL_PASSWORD;
export const AUTH_STORAGE_STATE = join(
  process.cwd(),
  "test-results",
  "auth",
  "portal-user.json",
);
export const AUTHENTICATED_PROJECT = "authenticated-chromium";
export const ONBOARDING_STORAGE_KEY = "ezapi:onboarding:v1";

type OnboardingMode = "skipped" | "fresh" | "preserve";

export function shouldSkipUnauthenticatedCiProject(projectName: string) {
  return Boolean(process.env.CI) && projectName !== AUTHENTICATED_PROJECT;
}

export function shouldSkipAuthenticatedProject(projectName: string) {
  return projectName === AUTHENTICATED_PROJECT;
}

export async function ensureDashboardSession(
  page: Page,
  { onboarding = "skipped" }: { onboarding?: OnboardingMode } = {},
) {
  await applyOnboardingState(page, onboarding);
  await ensureAuthenticatedContext(page);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard(?:$|[/?#])/, {
    timeout: 15_000,
  });

  if (onboarding === "fresh") {
    await expect(page.getByTestId("onboarding-dialog")).toBeVisible({
      timeout: 15_000,
    });
    return;
  }

  await expect(
    page.getByRole("heading", { name: "概览", level: 1 }),
  ).toBeVisible({ timeout: 15_000 });
}

export async function loginThroughPortalForm(
  page: Page,
  { onboarding = "skipped" }: { onboarding?: OnboardingMode } = {},
) {
  expect(E2E_IDENTIFIER, "E2E_PORTAL_IDENTIFIER is required").toBeTruthy();
  expect(E2E_PASSWORD, "E2E_PORTAL_PASSWORD is required").toBeTruthy();

  await applyOnboardingState(page, onboarding);
  await page.goto("/login");
  await page.getByLabel(/邮箱|用户名|邮箱或用户名/).fill(E2E_IDENTIFIER ?? "");
  await page.getByLabel("密码", { exact: true }).fill(E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: /登录|进入/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

async function applyOnboardingState(page: Page, onboarding: OnboardingMode) {
  if (onboarding === "preserve") {
    return;
  }

  await page.addInitScript(
    ({ key, mode }) => {
      if (mode === "fresh") {
        const freshAppliedKey = `${key}:e2e:fresh-applied`;

        if (window.sessionStorage.getItem(freshAppliedKey) === "1") {
          return;
        }

        window.localStorage.removeItem(key);
        window.sessionStorage.setItem(freshAppliedKey, "1");
        return;
      }

      window.localStorage.setItem(key, "skipped");
    },
    { key: ONBOARDING_STORAGE_KEY, mode: onboarding },
  );
}

async function ensureAuthenticatedContext(page: Page) {
  const existingSession = await getAuthMeSummary(page);

  if (existingSession.ok) {
    return;
  }

  const loadedStorageState = await loadAuthStorageState(page);

  if (loadedStorageState) {
    const storageSession = await getAuthMeSummary(page);

    if (storageSession.ok) {
      return;
    }
  }

  expect(E2E_IDENTIFIER, "E2E_PORTAL_IDENTIFIER is required").toBeTruthy();
  expect(E2E_PASSWORD, "E2E_PORTAL_PASSWORD is required").toBeTruthy();

  const login = await page.request.post("/api/auth/login", {
    data: {
      identifier: E2E_IDENTIFIER,
      password: E2E_PASSWORD,
    },
  });
  const loginSummary = await responseSummary(login);

  expect(
    login.ok(),
    `POST /api/auth/login failed while preparing E2E session: ${JSON.stringify(
      loginSummary,
    )}`,
  ).toBe(true);

  const verifiedSession = await getAuthMeSummary(page);

  expect(
    verifiedSession.ok,
    `GET /api/auth/me failed after E2E API login: ${JSON.stringify(
      verifiedSession,
    )}`,
  ).toBe(true);

  await saveCookieOnlyStorageState(page);
}

async function getAuthMeSummary(page: Page) {
  const response = await page.request.get("/api/auth/me");
  const summary = await responseSummary(response);

  return {
    ok: response.ok(),
    ...summary,
  };
}

async function loadAuthStorageState(page: Page) {
  try {
    const raw = await readFile(AUTH_STORAGE_STATE, "utf8");
    const state = JSON.parse(raw) as {
      cookies?: Parameters<ReturnType<Page["context"]>["addCookies"]>[0];
    };
    const cookies = Array.isArray(state.cookies) ? state.cookies : [];

    if (cookies.length === 0) {
      return false;
    }

    await page.context().addCookies(cookies);
    return true;
  } catch {
    return false;
  }
}

async function saveCookieOnlyStorageState(page: Page) {
  const state = await page.context().storageState();

  await mkdir(dirname(AUTH_STORAGE_STATE), { recursive: true });
  await writeFile(
    AUTH_STORAGE_STATE,
    `${JSON.stringify({ cookies: state.cookies, origins: [] }, null, 2)}\n`,
    "utf8",
  );
}

async function responseSummary(response: APIResponse | Response) {
  const text = await response.text().catch(() => "");
  let body: unknown = text.slice(0, 1_000);

  try {
    body = JSON.parse(text);
  } catch {
    // Keep the truncated text summary.
  }

  return {
    status: response.status(),
    body,
  };
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
