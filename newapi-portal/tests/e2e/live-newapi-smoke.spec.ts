import { randomUUID } from "node:crypto";

import { expect, test, type APIResponse, type Page, type Response } from "@playwright/test";

const requiredEnv = [
  "E2E_LIVE_SMOKE",
  "E2E_LIVE_REGISTER_EMAIL",
  "E2E_LIVE_REGISTER_PASSWORD",
  "E2E_LIVE_VERIFICATION_CODE",
  "E2E_LIVE_AFF_CODE",
  "E2E_LIVE_CHAT_MODEL",
  "E2E_LIVE_IMAGE_MODEL",
] as const;

test.describe.configure({ mode: "serial" });

test.describe("live NewAPI smoke", () => {
  test.setTimeout(180_000);

  test("registers, logs in, checks in, creates keys, and exercises playground APIs", async ({
    page,
  }, testInfo) => {
    skipUnlessLiveSmokeConfigured(test, testInfo.project.name);

    const runId = randomUUID().slice(0, 8);
    const account = buildLiveAccount(runId);

    const registration = await registerWithInternalCode(page, account);
    await logout(page);
    await login(page, account, registration);

    await assertAuthenticated(page, account.email);
    await checkIn(page);
    await createRegularToken(page, runId);
    const playgroundTokens = await ensurePlaygroundTokens(page);
    await runPlaygroundChat(page, playgroundTokens.chatTokenId);
    await runImageGeneration(page, playgroundTokens.imageTokenId);
  });
});

type LiveAccount = {
  email: string;
  username: string;
  password: string;
  verificationCode: string;
  affCode: string;
};

function skipUnlessLiveSmokeConfigured(
  testApi: { skip: (condition: boolean, description: string) => void },
  projectName: string,
) {
  testApi.skip(
    projectName !== "chromium",
    "Live smoke runs only in the chromium project.",
  );

  const missing = requiredEnv.filter((name) => !process.env[name]?.trim());
  testApi.skip(
    missing.length > 0 || process.env.E2E_LIVE_SMOKE !== "1",
    `Set E2E_LIVE_SMOKE=1 and required live env vars: ${missing.join(", ") || "none missing"}.`,
  );
}

function buildLiveAccount(runId: string): LiveAccount {
  const email = expandTemplate(process.env.E2E_LIVE_REGISTER_EMAIL!, runId)
    .trim()
    .toLowerCase();
  const username = expandTemplate(
    process.env.E2E_LIVE_REGISTER_USERNAME ?? `e2e_live_${runId}`,
    runId,
  ).trim();

  return {
    email,
    username,
    password: expandTemplate(process.env.E2E_LIVE_REGISTER_PASSWORD!, runId),
    verificationCode: process.env.E2E_LIVE_VERIFICATION_CODE!.trim(),
    affCode: process.env.E2E_LIVE_AFF_CODE!.trim(),
  };
}

function expandTemplate(value: string, runId: string): string {
  const timestamp = String(Date.now());
  return value
    .replaceAll("{uuid}", runId)
    .replaceAll("{random}", runId)
    .replaceAll("{timestamp}", timestamp);
}

type RegistrationResult = {
  status: number;
  body: unknown;
};

async function registerWithInternalCode(
  page: Page,
  account: LiveAccount,
): Promise<RegistrationResult> {
  await page.goto(`/register?aff_code=${encodeURIComponent(account.affCode)}`);
  await expect(
    page.getByRole("heading", { name: "免费创建账户" }),
  ).toBeVisible();

  await page.getByLabel("邮箱").fill(account.email);
  await page.getByRole("button", { name: "获取验证码" }).click();
  await expect(page.getByText(/验证码已发送/)).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("用户名").fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByLabel("确认密码").fill(account.password);
  await page.getByLabel("验证码").fill(account.verificationCode);

  const registerResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/register") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "注册", exact: true }).click();

  const response = await registerResponse;
  const body = await readResponseBody(response);
  expect(
    response.ok(),
    `POST /api/auth/register failed: ${JSON.stringify(body)}`,
  ).toBe(true);
  expect([201, 202]).toContain(response.status());

  if (response.status() === 201) {
    await expect(page).toHaveURL(/\/dashboard(?:$|[/?#])/, { timeout: 15_000 });
  } else {
    await expect(page.getByRole("link", { name: "登录" })).toBeVisible();
  }

  return { status: response.status(), body };
}

async function logout(page: Page) {
  await page.request.post("/api/auth/logout");
  await page.context().clearCookies();
}

async function login(
  page: Page,
  account: LiveAccount,
  registration: RegistrationResult,
) {
  await page.goto("/login");
  await page.getByLabel(/邮箱|用户名|邮箱或用户名/).fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill(account.password);

  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /登录|进入/ }).click();

  const response = await loginResponse;
  const body = await readResponseBody(response);
  expect(
    response.ok(),
    `POST /api/auth/login failed: ${JSON.stringify({
      login: body,
      registration,
    })}`,
  ).toBe(true);

  await page.waitForURL(/\/dashboard(?:$|[/?#])/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "概览" })).toBeVisible({
    timeout: 15_000,
  });
}

async function assertAuthenticated(page: Page, email: string) {
  const me = await page.request.get("/api/auth/me");
  const body = await readResponseBody(me);
  expect(me.ok(), `GET /api/auth/me failed: ${JSON.stringify(body)}`).toBe(true);
  expect(body).toEqual(
    expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        user: expect.objectContaining({
          email,
          newApiBinding: "ready",
        }),
      }),
    }),
  );
}

async function checkIn(page: Page) {
  const response = await page.request.post("/api/checkin");
  const body = await readResponseBody(response);
  expect(
    response.ok(),
    `POST /api/checkin failed: ${JSON.stringify(body)}`,
  ).toBe(true);
  const checkinData = unwrapData(body);
  expect(
    checkinData &&
      (checkinData.checkedIn === true ||
        checkinData.checkedInToday === true ||
        checkinData.alreadyCheckedIn === true),
    `POST /api/checkin did not report a successful check-in: ${JSON.stringify(body)}`,
  ).toBe(true);

  const summary = await page.request.get("/api/dashboard/summary");
  const summaryBody = await readResponseBody(summary);
  expect(
    summary.ok(),
    `GET /api/dashboard/summary failed: ${JSON.stringify(summaryBody)}`,
  ).toBe(true);
  expect(unwrapData(summaryBody)).toEqual(
    expect.objectContaining({
      checkin: expect.objectContaining({ checkedInToday: true }),
    }),
  );
}

async function createRegularToken(page: Page, runId: string) {
  const response = await page.request.post("/api/tokens", {
    data: {
      name: `e2e-live-smoke-${runId}`,
      unlimited_quota: true,
    },
  });
  const body = await readResponseBody(response);
  expect(response.ok(), `POST /api/tokens failed: ${JSON.stringify(body)}`).toBe(
    true,
  );

  const data = unwrapData(body);
  expect(data).toEqual(
    expect.objectContaining({
      keyReturnedOnce: true,
      key: expect.stringMatching(/^sk-/),
      token: expect.objectContaining({ id: expect.any(Number) }),
    }),
  );

  const tokenId = getRecord(data?.token)?.id;
  if (typeof tokenId === "number") {
    await page.request.delete(`/api/tokens/${encodeURIComponent(String(tokenId))}`);
  }
}

async function ensurePlaygroundTokens(page: Page) {
  const response = await page.request.get("/api/playground/token");
  const body = await readResponseBody(response);
  expect(
    response.ok(),
    `GET /api/playground/token failed: ${JSON.stringify(body)}`,
  ).toBe(true);

  const data = unwrapData(body);
  expect(data).toEqual(
    expect.objectContaining({
      chatTokenId: expect.any(Number),
      imageTokenId: expect.any(Number),
    }),
  );

  return data as { chatTokenId: number; imageTokenId: number };
}

async function runPlaygroundChat(page: Page, tokenId: number) {
  const response = await page.request.post("/api/playground/chat", {
    data: {
      tokenId,
      model: process.env.E2E_LIVE_CHAT_MODEL,
      messages: [
        {
          role: "user",
          content:
            process.env.E2E_LIVE_CHAT_PROMPT ??
            "Reply with a short health-check sentence.",
        },
      ],
      max_tokens: 64,
      temperature: 0,
    },
  });
  const body = await response.text();
  expect(
    response.ok(),
    `POST /api/playground/chat failed: ${body.slice(0, 1_000)}`,
  ).toBe(true);
  expect(body).toContain("data:");
  expect(body).toMatch(/\[DONE\]|choices/);
}

async function runImageGeneration(page: Page, tokenId: number) {
  const response = await page.request.post("/api/playground/images/generations", {
    data: {
      tokenId,
      model: process.env.E2E_LIVE_IMAGE_MODEL,
      prompt:
        process.env.E2E_LIVE_IMAGE_PROMPT ??
        "A small clean blue circle on a plain white background.",
      n: 1,
      size: process.env.E2E_LIVE_IMAGE_SIZE ?? "1024x1024",
    },
  });
  const body = await readResponseBody(response);
  expect(
    response.ok(),
    `POST /api/playground/images/generations failed: ${JSON.stringify(body)}`,
  ).toBe(true);

  const data = getRecord(body)?.data;
  expect(Array.isArray(data)).toBe(true);
  const images = data as unknown[];
  expect(images).toEqual(expect.arrayContaining([expect.any(Object)]));
  expect(
    images.some(
      (item) =>
        getRecord(item)?.url ||
        getRecord(item)?.b64_json ||
        getRecord(item)?.revised_prompt,
    ),
    `Image response did not include a visible image result: ${JSON.stringify(body)}`,
  ).toBe(true);
}

async function readResponseBody(response: APIResponse | Response): Promise<unknown> {
  const text = await response.text().catch(() => "");

  if (!text.trim()) {
    return "<empty>";
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function unwrapData(body: unknown): Record<string, unknown> | undefined {
  const record = getRecord(body);
  return getRecord(record?.data) ?? record;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
