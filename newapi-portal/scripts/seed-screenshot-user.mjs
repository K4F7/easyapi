#!/usr/bin/env node

const baseUrl = (process.env.SEED_BASE_URL ?? "https://test.easyapi.work").replace(
  /\/$/,
  "",
);
const email = (process.env.SEED_EMAIL ?? "scr@easyapi.work").toLowerCase();
const password =
  process.env.SEED_PASSWORD ??
  process.env.E2E_PORTAL_PASSWORD ??
  "ScreenshotTest123!";
const newApiBaseUrl = process.env.NEWAPI_BASE_URL?.replace(/\/$/, "");
const newApiAdminToken = process.env.NEWAPI_ADMIN_TOKEN;
const newApiAdminUserId = process.env.NEWAPI_ADMIN_USER_ID ?? "1";

async function register() {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, acceptedTerms: true }),
  });
  const payload = await readJson(response);
  return { response, payload };
}

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: email, password }),
  });
  const payload = await readJson(response);
  return { response, payload };
}

async function adminCreateUser() {
  if (!newApiBaseUrl || !newApiAdminToken) {
    throw new Error(
      "Registration failed and NEWAPI_BASE_URL / NEWAPI_ADMIN_TOKEN are not set for admin fallback.",
    );
  }

  const response = await fetch(`${newApiBaseUrl}/api/user/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${newApiAdminToken}`,
      "New-Api-User": newApiAdminUserId,
    },
    body: JSON.stringify({
      username: email,
      password,
      display_name: "Screenshot Test User",
      role: 1,
    }),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      `NewAPI admin create user failed (${response.status}): ${extractMessage(payload)}`,
    );
  }

  return payload;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(payload) {
  if (!payload || typeof payload !== "object") {
    return String(payload ?? "unknown error");
  }

  return payload.message ?? payload.error ?? payload.msg ?? JSON.stringify(payload);
}

function printCredentials(source) {
  console.log(`\nScreenshot test user ready (${source}).`);
  console.log(`SEED_BASE_URL=${baseUrl}`);
  console.log(`E2E_PORTAL_IDENTIFIER=${email}`);
  console.log(`E2E_PORTAL_PASSWORD=${password}`);
}

async function main() {
  console.log(`Seeding screenshot test user against ${baseUrl} ...`);

  const registerResult = await register();

  if (registerResult.response.ok) {
    printCredentials("registered");
    return;
  }

  const registerCode =
    registerResult.payload &&
    typeof registerResult.payload === "object" &&
    registerResult.payload.error &&
    typeof registerResult.payload.error === "object"
      ? registerResult.payload.error.code
      : undefined;

  if (
    registerResult.response.status === 409 ||
    registerCode === "EMAIL_ALREADY_REGISTERED" ||
    registerResult.response.status >= 500
  ) {
    const loginResult = await login();
    if (loginResult.response.ok) {
      printCredentials(
        registerResult.response.status === 409 ||
          registerCode === "EMAIL_ALREADY_REGISTERED"
          ? "already registered, login verified"
          : "register failed, login verified",
      );
      return;
    }

    if (
      registerResult.response.status === 409 ||
      registerCode === "EMAIL_ALREADY_REGISTERED"
    ) {
      throw new Error(
        `User exists but login failed (${loginResult.response.status}): ${extractMessage(loginResult.payload)}`,
      );
    }
  }

  console.warn(
    `Register failed (${registerResult.response.status}): ${extractMessage(registerResult.payload)}`,
  );
  console.warn("Trying NewAPI admin fallback ...");

  await adminCreateUser();
  const loginResult = await login();
  if (!loginResult.response.ok) {
    throw new Error(
      `Admin user created but portal login failed (${loginResult.response.status}): ${extractMessage(loginResult.payload)}`,
    );
  }

  printCredentials("admin fallback + login");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
