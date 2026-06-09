#!/usr/bin/env node

/**
 * Diagnose Playground chat model loading: URL vs key vs portal BFF.
 *
 * Usage:
 *   node scripts/diagnose-playground-upstream.mjs
 *   node scripts/diagnose-playground-upstream.mjs --portal http://localhost:3001
 *   node scripts/diagnose-playground-upstream.mjs --upstream https://easyapi.work --key sk-...
 *
 * Env overrides:
 *   PORTAL_BASE_URL, PORTAL_IDENTIFIER, PORTAL_PASSWORD
 *   UPSTREAM_BASE_URL, UPSTREAM_API_KEY
 */

const args = process.argv.slice(2);

function readArg(name, fallback = "") {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) {
    return fallback;
  }
  return args[index + 1];
}

const portalBaseUrl = (
  readArg("--portal") ||
  process.env.PORTAL_BASE_URL ||
  "http://localhost:3001"
).replace(/\/+$/, "");

const identifier =
  readArg("--identifier") ||
  process.env.PORTAL_IDENTIFIER ||
  process.env.SEED_EMAIL ||
  "scr@qq.com";

const password =
  readArg("--password") ||
  process.env.PORTAL_PASSWORD ||
  process.env.SEED_PASSWORD ||
  "ScreenshotTest123!";

const upstreamBaseUrl = (
  readArg("--upstream") || process.env.UPSTREAM_BASE_URL || ""
).replace(/\/+$/, "");

const upstreamApiKey =
  readArg("--key") || process.env.UPSTREAM_API_KEY || "";

function logSection(title) {
  console.log(`\n=== ${title} ===`);
}

function summarizeBody(text, max = 240) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { response, text, json };
}

async function loginPortal() {
  logSection(`Portal login (${portalBaseUrl})`);
  const { response, json } = await requestJson(`${portalBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });

  const cookieParts =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];

  const sessionCookie = cookieParts
    .flatMap((part) => part.split(","))
    .map((part) => part.split(";")[0].trim())
    .find((part) => part.startsWith("portal_session="));

  console.log(`HTTP ${response.status}`);
  console.log(`authSource: ${json?.data?.authSource ?? json?.error?.code ?? "unknown"}`);

  if (!response.ok || !json?.ok) {
    throw new Error(json?.error?.message ?? "Portal login failed");
  }

  if (!sessionCookie) {
    throw new Error("Portal login succeeded but no portal_session cookie was returned");
  }

  return sessionCookie;
}

async function fetchPlaygroundToken(sessionCookie) {
  logSection("Playground token");
  const { response, json } = await requestJson(`${portalBaseUrl}/api/playground/token`, {
    headers: { Cookie: sessionCookie },
  });

  console.log(`HTTP ${response.status}`);
  console.log(JSON.stringify(json?.data ?? json?.error ?? null, null, 2));

  if (!response.ok || !json?.ok) {
    throw new Error(json?.error?.message ?? "Failed to load playground token");
  }

  const chatTokenId = json.data.chatTokenId ?? json.data.tokenId;
  if (!chatTokenId) {
    throw new Error("Playground chatTokenId missing");
  }

  return chatTokenId;
}

async function fetchPlaygroundModels(sessionCookie, chatTokenId) {
  logSection(`Portal BFF models (tokenId=${chatTokenId})`);
  const { response, json } = await requestJson(
    `${portalBaseUrl}/api/playground/models?tokenId=${chatTokenId}`,
    { headers: { Cookie: sessionCookie } },
  );

  console.log(`HTTP ${response.status}`);
  console.log(JSON.stringify(json?.data ?? json?.error ?? null, null, 2));

  if (!response.ok || !json?.ok) {
    const message = json?.error?.message ?? "Portal models route failed";
    throw new Error(message);
  }

  return json.data.models ?? [];
}

async function probeDirectUpstream(baseUrl, key) {
  logSection(`Direct upstream probe (${baseUrl}/v1/models)`);
  const response = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
    redirect: "manual",
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  console.log(`HTTP ${response.status}`);
  console.log(`content-type: ${contentType || "(missing)"}`);

  if (response.status >= 300 && response.status < 400) {
    console.log(`location: ${response.headers.get("location") ?? "(missing)"}`);
    console.log("Diagnosis: URL problem — endpoint redirects instead of returning JSON models.");
    return;
  }

  if (!contentType.includes("application/json")) {
    console.log(`body: ${summarizeBody(text)}`);
    console.log("Diagnosis: URL problem — response is not JSON (likely Portal HTML or login page).");
    return;
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    console.log("Diagnosis: URL problem — body advertised as JSON but failed to parse.");
    return;
  }

  if (!response.ok) {
    console.log(`body: ${summarizeBody(text)}`);
    console.log(
      response.status === 401 || response.status === 403
        ? "Diagnosis: key problem — upstream rejected the API key."
        : `Diagnosis: upstream HTTP ${response.status}.`,
    );
    return;
  }

  const models = Array.isArray(payload?.data) ? payload.data : [];
  console.log(`models: ${models.length}`);
  if (models.length > 0) {
    console.log(`sample: ${models.slice(0, 5).map((item) => item.id).join(", ")}`);
  }
  console.log("Diagnosis: direct upstream OK.");
}

async function main() {
  console.log("Playground upstream diagnostic");
  console.log(`portal=${portalBaseUrl}`);
  console.log(`identifier=${identifier}`);

  const sessionCookie = await loginPortal();
  const chatTokenId = await fetchPlaygroundToken(sessionCookie);
  const models = await fetchPlaygroundModels(sessionCookie, chatTokenId);

  logSection("Result");
  console.log(`Loaded ${models.length} model(s) through portal BFF.`);

  if (upstreamBaseUrl && upstreamApiKey) {
    await probeDirectUpstream(upstreamBaseUrl, upstreamApiKey);
  } else {
    console.log(
      "Tip: pass --upstream https://easyapi.work --key <token-key> to test URL vs key directly.",
    );
  }
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
