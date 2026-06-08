import { expect, request as playwrightRequest, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { AUTH_STORAGE_STATE, E2E_IDENTIFIER, E2E_PASSWORD } from "./helpers";

test("authenticate portal account once", async ({ baseURL }) => {
  expect(E2E_IDENTIFIER, "E2E_PORTAL_IDENTIFIER is required").toBeTruthy();
  expect(E2E_PASSWORD, "E2E_PORTAL_PASSWORD is required").toBeTruthy();

  const request = await playwrightRequest.newContext({ baseURL });

  try {
    const login = await request.post("/api/auth/login", {
      data: {
        identifier: E2E_IDENTIFIER,
        password: E2E_PASSWORD,
      },
    });
    const loginBody = await safeResponseSummary(login);

    expect(
      login.ok(),
      `POST /api/auth/login failed: ${JSON.stringify(loginBody)}`,
    ).toBe(true);

    const me = await request.get("/api/auth/me");
    const meBody = await safeResponseSummary(me);

    expect(
      me.ok(),
      `GET /api/auth/me failed after login: ${JSON.stringify(meBody)}`,
    ).toBe(true);

    const state = await request.storageState();

    expect(
      state.cookies.some((cookie) => cookie.name === "portal_session"),
      "POST /api/auth/login did not set the portal_session cookie",
    ).toBe(true);

    await mkdir(dirname(AUTH_STORAGE_STATE), { recursive: true });
    await writeFile(
      AUTH_STORAGE_STATE,
      `${JSON.stringify({ cookies: state.cookies, origins: [] }, null, 2)}\n`,
      "utf8",
    );
  } finally {
    await request.dispose();
  }
});

async function safeResponseSummary(response: {
  status: () => number;
  text: () => Promise<string>;
}) {
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
