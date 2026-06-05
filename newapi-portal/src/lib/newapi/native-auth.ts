import "server-only";

import { getNewApiConfig } from "./client";

export class NewApiNativeAuthError extends Error {
  readonly code:
    | "NEWAPI_2FA_REQUIRED"
    | "NEWAPI_INVALID_CREDENTIALS"
    | "NEWAPI_VERIFICATION_REQUIRED"
    | "NEWAPI_VERIFICATION_SEND_FAILED"
    | "NEWAPI_REGISTER_DISABLED"
    | "NEWAPI_REGISTER_FAILED";
  readonly status: number;
  readonly payload?: unknown;

  constructor(
    code: NewApiNativeAuthError["code"],
    message: string,
    options: { status?: number; payload?: unknown } = {},
  ) {
    super(message);
    this.name = "NewApiNativeAuthError";
    this.code = code;
    this.status = options.status ?? 0;
    this.payload = options.payload;
  }
}

export async function registerNewApiUser(input: {
  username: string;
  email: string;
  password: string;
  verificationCode?: string;
  turnstile?: string;
  affCode?: string;
}): Promise<void> {
  const query = input.turnstile ? { turnstile: input.turnstile } : undefined;
  const response = await fetchNewApi("/api/user/register", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      email: input.email,
      verification_code: input.verificationCode,
      aff_code: input.affCode,
    }),
  }, query);
  const payload = await parseJson(response);

  if (!response.ok || isSuccessFalse(payload)) {
    throw new NewApiNativeAuthError(
      classifyRegisterFailure(response.status, payload),
      extractMessage(payload) || "NewAPI registration failed",
      { status: response.status, payload },
    );
  }
}

export async function sendNewApiVerificationEmail(input: {
  email: string;
}): Promise<void> {
  const response = await fetchNewApi("/api/verification", {
    method: "GET",
    cache: "no-store",
  }, { email: input.email });
  const payload = await parseJson(response);

  if (!response.ok || isSuccessFalse(payload)) {
    throw new NewApiNativeAuthError(
      "NEWAPI_VERIFICATION_SEND_FAILED",
      extractMessage(payload) || "NewAPI verification email send failed",
      { status: response.status, payload },
    );
  }
}

function newApiUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(`${getNewApiConfig().baseUrl}${path}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

async function fetchNewApi(
  path: string,
  init: RequestInit,
  query?: Record<string, string | undefined>,
): Promise<Response> {
  try {
    return await fetch(newApiUrl(path, query), init);
  } catch (error) {
    throw new NewApiNativeAuthError(
      "NEWAPI_REGISTER_FAILED",
      "NewAPI request failed",
      { payload: error },
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

function classifyRegisterFailure(
  status: number,
  payload: unknown,
): NewApiNativeAuthError["code"] {
  const text = normalizeFailureText(payload);

  if (includesAny(text, ["turnstile", "captcha", "verification", "verify", "验证码", "验证", "校验"])) {
    return "NEWAPI_VERIFICATION_REQUIRED";
  }

  if (includesAny(text, ["disabled", "not enabled", "closed", "forbidden", "关闭", "未开启", "禁用", "不允许"])) {
    return "NEWAPI_REGISTER_DISABLED";
  }

  if (status === 403) {
    return "NEWAPI_VERIFICATION_REQUIRED";
  }

  return "NEWAPI_REGISTER_FAILED";
}

function normalizeFailureText(payload: unknown): string {
  const message = extractMessage(payload) ?? "";
  const code = isRecord(payload) ? String(payload.code ?? "") : "";

  return `${code} ${message}`.trim().toLowerCase();
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function isSuccessFalse(payload: unknown): boolean {
  return isRecord(payload) && payload.success === false;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
