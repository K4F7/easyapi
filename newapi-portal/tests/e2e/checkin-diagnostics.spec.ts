import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  E2E_IDENTIFIER,
  E2E_PASSWORD,
  ensureDashboardSession,
} from "./helpers";

test.describe("check-in diagnostics", () => {
  test("applies check-in quota and prints correlated diagnostics", async ({
    page,
  }) => {
    test.skip(
      !E2E_IDENTIFIER || !E2E_PASSWORD,
      "Set E2E_PORTAL_IDENTIFIER and E2E_PORTAL_PASSWORD.",
    );

    await ensureDashboardSession(page);

    const requestId = `checkin-diagnostics-${randomUUID()}`;
    const baseURL = process.env.E2E_BASE_URL ?? "https://test.easyapi.work";

    const me = await page.request.get("/api/auth/me");
    const meBody = await readResponseBody(me);
    expect(me.ok(), diagnostic("GET /api/auth/me failed", { meBody })).toBe(
      true,
    );

    const beforeSummary = await page.request.get("/api/dashboard/summary");
    const beforeSummaryBody = await readResponseBody(beforeSummary);
    expect(
      beforeSummary.ok(),
      diagnostic("GET /api/dashboard/summary before check-in failed", {
        beforeSummaryBody,
      }),
    ).toBe(true);

    const checkin = await page.request.post("/api/checkin", {
      headers: {
        "x-request-id": requestId,
      },
    });
    const checkinBody = await readResponseBody(checkin);

    const afterSummary = await page.request.get("/api/dashboard/summary");
    const afterSummaryBody = await readResponseBody(afterSummary);
    expect(
      afterSummary.ok(),
      diagnostic("GET /api/dashboard/summary after check-in failed", {
        afterSummaryBody,
      }),
    ).toBe(true);

    const diagnostics = {
      requestId,
      baseURL,
      user: summarizeMe(meBody),
      beforeCheckin: summarizeCheckin(beforeSummaryBody),
      postCheckin: {
        status: checkin.status(),
        body: checkinBody,
      },
      afterCheckin: summarizeCheckin(afterSummaryBody),
    };

    console.info(
      "checkin diagnostics",
      JSON.stringify(diagnostics, null, 2),
    );

    expect(
      checkin.ok(),
      diagnostic("POST /api/checkin returned non-2xx", diagnostics),
    ).toBe(true);

    expect(
      isRecord(checkinBody) && isRecord(checkinBody.data),
      diagnostic("POST /api/checkin succeeded but response data is missing", {
        ...diagnostics,
        postBody: checkinBody,
      }),
    ).toBe(true);

    const checkinData = unwrapData(checkinBody);
    const afterCheckin = summarizeCheckin(afterSummaryBody);

    expect(
      checkinData?.quotaApplied,
      diagnostic("POST /api/checkin succeeded but quotaApplied is not true", {
        ...diagnostics,
        postData: checkinData,
      }),
    ).toBe(true);

    expect(
      afterCheckin,
      diagnostic("POST /api/checkin succeeded but summary checkin is missing", {
        ...diagnostics,
        afterCheckin,
      }),
    ).not.toBeNull();

    expect(
      afterCheckin?.checkedInToday,
      diagnostic("POST /api/checkin succeeded but summary checkedInToday is not true", {
        ...diagnostics,
        afterCheckin,
      }),
    ).toBe(true);

    expect(
      afterCheckin?.quotaPending,
      diagnostic("POST /api/checkin succeeded but summary quotaPending is not false", {
        ...diagnostics,
        afterCheckin,
      }),
    ).toBe(false);

    expect(
      afterCheckin?.quotaApplied,
      diagnostic("POST /api/checkin succeeded but summary quotaApplied is not true", {
        ...diagnostics,
        afterCheckin,
      }),
    ).toBe(true);
  });
});

async function readResponseBody(response: {
  text: () => Promise<string>;
}): Promise<unknown> {
  const text = await response.text();

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
  if (!isRecord(body)) {
    return undefined;
  }

  return isRecord(body.data) ? body.data : body;
}

function summarizeMe(body: unknown) {
  const data = unwrapData(body);
  const user = isRecord(data?.user) ? data.user : data;

  if (!isRecord(user)) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    newApiBinding: user.newApiBinding,
    newApiUserId: user.newApiUserId,
  };
}

function summarizeCheckin(body: unknown) {
  const data = unwrapData(body);
  const checkin = isRecord(data?.checkin) ? data.checkin : data;

  if (!isRecord(checkin)) {
    return null;
  }

  return {
    checkedInToday: checkin.checkedInToday,
    checkedInOn: checkin.checkedInOn,
    status: checkin.status,
    checkinId: checkin.checkinId,
    quotaApplied: checkin.quotaApplied,
    quotaPending: checkin.quotaPending,
  };
}

function diagnostic(message: string, details: unknown) {
  return `${message}\n${JSON.stringify(details, null, 2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
