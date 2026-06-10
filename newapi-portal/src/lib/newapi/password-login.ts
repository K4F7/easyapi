import "server-only";

import { getNewApiConfig } from "./client";

type NewApiLoginData = {
  id?: number | string;
  user_id?: number | string;
  userId?: number | string;
  username?: string;
  display_name?: string;
  displayName?: string;
  require_2fa?: boolean;
  require2fa?: boolean;
};

type NewApiPasswordLoginResult = {
  userId: string;
  username: string;
  accessToken: string;
};

export class NewApiPasswordLoginError extends Error {
  readonly code:
    | "NEWAPI_INVALID_CREDENTIALS"
    | "NEWAPI_UPSTREAM_DISABLED"
    | "NEWAPI_VERIFICATION_REQUIRED"
    | "NEWAPI_LOGIN_FAILED"
    | "NEWAPI_TOKEN_FAILED";
  readonly status: number;
  readonly payload?: unknown;
  override readonly cause?: unknown;

  constructor(
    code: NewApiPasswordLoginError["code"],
    message: string,
    options: { status?: number; payload?: unknown; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "NewApiPasswordLoginError";
    this.code = code;
    this.status = options.status ?? 0;
    this.payload = options.payload;
    this.cause = options.cause;
  }
}

export async function loginNewApiWithPassword(input: {
  username: string;
  password: string;
}): Promise<NewApiPasswordLoginResult> {
  const loginResponse = await fetchNewApi("/api/user/login", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const loginPayload = await parseJson(loginResponse);

  if (!loginResponse.ok || isSuccessFalse(loginPayload)) {
    throw new NewApiPasswordLoginError(
      classifyLoginFailure(loginResponse.status, loginPayload),
      extractMessage(loginPayload) || "NewAPI login failed",
      { status: loginResponse.status, payload: loginPayload },
    );
  }

  const loginData = extractData(loginPayload);

  const rawUserId = loginData.id ?? loginData.user_id ?? loginData.userId;
  const userId = rawUserId === undefined ? null : String(rawUserId);

  if (!userId) {
    throw new NewApiPasswordLoginError(
      "NEWAPI_LOGIN_FAILED",
      "NewAPI login response did not include a user id",
      { status: loginResponse.status, payload: loginPayload },
    );
  }

  const cookieHeader = buildCookieHeader(loginResponse.headers);

  if (!cookieHeader) {
    throw new NewApiPasswordLoginError(
      "NEWAPI_LOGIN_FAILED",
      "NewAPI login response did not include a session cookie",
      { status: loginResponse.status, payload: loginPayload },
    );
  }

  const tokenResponse = await fetchNewApi("/api/user/token", {
    method: "GET",
    cache: "no-store",
    headers: {
      Cookie: cookieHeader,
      "New-Api-User": userId,
    },
  });
  const tokenPayload = await parseJson(tokenResponse);

  if (!tokenResponse.ok || isSuccessFalse(tokenPayload)) {
    throw new NewApiPasswordLoginError(
      "NEWAPI_TOKEN_FAILED",
      extractMessage(tokenPayload) || "NewAPI access token request failed",
      { status: tokenResponse.status, payload: tokenPayload },
    );
  }

  const accessToken = extractAccessToken(tokenPayload);

  if (!accessToken) {
    throw new NewApiPasswordLoginError(
      "NEWAPI_TOKEN_FAILED",
      "NewAPI access token response did not include a token",
      { status: tokenResponse.status, payload: tokenPayload },
    );
  }

  return {
    userId,
    username: loginData.username || input.username,
    accessToken,
  };
}

function newApiUrl(path: string): string {
  return `${getNewApiConfig().baseUrl}${path}`;
}

async function fetchNewApi(path: string, init: RequestInit): Promise<Response> {
  let url: string;

  try {
    url = newApiUrl(path);
  } catch (error) {
    throw new NewApiPasswordLoginError(
      path.endsWith("/token") ? "NEWAPI_TOKEN_FAILED" : "NEWAPI_LOGIN_FAILED",
      error instanceof Error ? error.message : "Invalid NewAPI configuration",
      { payload: error },
    );
  }

  try {
    return await fetch(url, init);
  } catch (error) {
    throw new NewApiPasswordLoginError(
      path.endsWith("/token") ? "NEWAPI_TOKEN_FAILED" : "NEWAPI_LOGIN_FAILED",
      `NewAPI request failed: ${formatFetchError(error)}`,
      { cause: error, payload: sanitizeFetchError(error) },
    );
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractData(payload: unknown): NewApiLoginData {
  if (!isRecord(payload)) {
    return {};
  }

  const user = findRecord(payload, ["user", "account"]);

  if (user) {
    return user;
  }

  const data = payload.data;

  if (isRecord(data)) {
    return findRecord(data, ["user", "account"]) ?? data;
  }

  return payload;
}

function extractAccessToken(payload: unknown): string | null {
  if (typeof payload === "string" && payload.length > 0) {
    return payload;
  }

  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.data === "string" && payload.data.length > 0) {
    return payload.data;
  }

  for (const key of ["access_token", "accessToken", "token"]) {
    const value = payload[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  for (const key of ["data", "user"]) {
    const value = payload[key];

    if (isRecord(value)) {
      const token = extractAccessToken(value);

      if (token) {
        return token;
      }
    }
  }

  return null;
}

function buildCookieHeader(headers: Headers): string {
  const setCookies =
    (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    splitSetCookie(headers.get("set-cookie"));

  return setCookies
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function splitSetCookie(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/);
}

function findRecord(
  source: Record<string, unknown>,
  keys: string[],
): NewApiLoginData | null {
  for (const key of keys) {
    const value = source[key];

    if (isRecord(value)) {
      return value;
    }
  }

  return null;
}

function isSuccessFalse(payload: unknown): boolean {
  return isRecord(payload) && payload.success === false;
}

function classifyLoginFailure(
  status: number,
  payload: unknown,
): NewApiPasswordLoginError["code"] {
  const message = normalizeFailureText(extractMessage(payload));
  const code = normalizeFailureText(extractCode(payload));
  const combined = `${code} ${message}`.trim();

  if (
    combined.includes("turnstile") ||
    combined.includes("captcha") ||
    combined.includes("recaptcha") ||
    combined.includes("hcaptcha") ||
    combined.includes("verification") ||
    combined.includes("verify") ||
    combined.includes("challenge") ||
    combined.includes("验证码") ||
    combined.includes("验证") ||
    combined.includes("校验")
  ) {
    return "NEWAPI_VERIFICATION_REQUIRED";
  }

  if (
    combined.includes("disabled") ||
    combined.includes("not enabled") ||
    combined.includes("not allow") ||
    combined.includes("not allowed") ||
    combined.includes("closed") ||
    combined.includes("forbidden") ||
    combined.includes("禁止") ||
    combined.includes("禁用") ||
    combined.includes("关闭") ||
    combined.includes("未开启") ||
    combined.includes("不允许")
  ) {
    return "NEWAPI_UPSTREAM_DISABLED";
  }

  if (
    combined.includes("invalid credential") ||
    combined.includes("invalid password") ||
    combined.includes("incorrect password") ||
    combined.includes("wrong password") ||
    combined.includes("user not found") ||
    combined.includes("account not found") ||
    combined.includes("用户名或密码") ||
    combined.includes("密码错误") ||
    combined.includes("用户不存在") ||
    combined.includes("账号不存在")
  ) {
    return "NEWAPI_INVALID_CREDENTIALS";
  }

  if (status === 401) {
    return "NEWAPI_INVALID_CREDENTIALS";
  }

  return "NEWAPI_LOGIN_FAILED";
}

function extractMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    return payload;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const message = payload.message ?? payload.error ?? payload.msg;
  return typeof message === "string" ? message : null;
}

function extractCode(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const code = payload.code ?? payload.error_code ?? payload.errorCode;
  return typeof code === "string" ? code : null;
}

function normalizeFailureText(value: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function formatFetchError(error: unknown): string {
  if (error instanceof Error) {
    const cause = sanitizeFetchError(error.cause);
    const detail =
      cause && typeof cause === "object" && "code" in cause
        ? ` (${String(cause.code)})`
        : "";

    return `${error.message}${detail}`;
  }

  return String(error);
}

function sanitizeFetchError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause: sanitizeFetchError(error.cause),
    };
  }

  if (isRecord(error)) {
    return {
      code: typeof error.code === "string" ? error.code : undefined,
      errno: typeof error.errno === "number" ? error.errno : undefined,
      syscall: typeof error.syscall === "string" ? error.syscall : undefined,
      address: typeof error.address === "string" ? error.address : undefined,
      port: typeof error.port === "number" ? error.port : undefined,
    };
  }

  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
