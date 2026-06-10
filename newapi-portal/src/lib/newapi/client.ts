import "server-only";

import { getNewApiAdminEnv, getNewApiBaseUrl } from "@/lib/env";

import type { NewApiAuth, NewApiEnvelope } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;

type QueryValue = string | number | boolean | null | undefined;

interface NewApiRequestOptions extends Omit<RequestInit, "body" | "headers"> {
  auth?: NewApiAuth;
  headers?: HeadersInit;
  json?: unknown;
  query?: Record<string, QueryValue>;
  timeoutMs?: number;
  unwrap?: boolean;
  /** Internal: prevents infinite 401 refresh loops. */
  _retried401?: boolean;
}

interface NewApiErrorOptions {
  status: number;
  statusText?: string;
  code?: string | number | boolean;
  payload?: unknown;
  cause?: unknown;
}

export class NewApiError extends Error {
  readonly status: number;
  readonly statusText?: string;
  readonly code?: string | number | boolean;
  readonly payload?: unknown;

  constructor(message: string, options: NewApiErrorOptions) {
    super(message);
    this.name = "NewApiError";
    this.status = options.status;
    this.statusText = options.statusText;
    this.code = options.code;
    this.payload = options.payload;
    this.cause = options.cause;
  }
}

export function normalizeNewApiBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("NEWAPI_BASE_URL is required");
  }

  return normalized;
}

export function getNewApiConfig() {
  const baseUrl = getNewApiBaseUrl();

  return {
    baseUrl: normalizeNewApiBaseUrl(baseUrl),
    adminUserId: process.env.NEWAPI_ADMIN_USER_ID,
  };
}

export function getNewApiAdminAuth(): NewApiAuth {
  const env = getNewApiAdminEnv();

  return {
    accessToken: env.NEWAPI_ADMIN_TOKEN,
    userId: env.NEWAPI_ADMIN_USER_ID,
  };
}

export async function newApiRequest<T = unknown>(
  path: string,
  options: NewApiRequestOptions = {},
): Promise<T> {
  const {
    auth,
    headers,
    json,
    query,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    unwrap = true,
    signal,
    _retried401 = false,
    ...init
  } = options;
  const url = buildUrl(path, query);
  const requestHeaders = new Headers(headers);
  let didTimeout = false;

  if (auth) {
    requestHeaders.set("Authorization", `Bearer ${auth.accessToken}`);
    requestHeaders.set("New-Api-User", String(auth.userId));
  }

  if (json !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort(signal?.reason);

  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const response = await fetch(url, {
      ...init,
      body: json === undefined ? undefined : JSON.stringify(json),
      cache: init.cache ?? "no-store",
      headers: requestHeaders,
      signal: controller.signal,
    });
    const payload = await parseResponseBody(response);

    if (!response.ok) {
      if (
        response.status === 401 &&
        auth?._portalRefresh &&
        !_retried401
      ) {
        try {
          const refreshedAuth = await auth._portalRefresh();
          return newApiRequest<T>(path, {
            ...options,
            auth: refreshedAuth,
            _retried401: true,
          });
        } catch (refreshError) {
          throw newApiHttpError(response, payload, refreshError);
        }
      }

      throw newApiHttpError(response, payload);
    }

    if (isEnvelope(payload)) {
      if (payload.success === false) {
        throw newApiEnvelopeError(response, payload);
      }

      return (unwrap ? payload.data : payload) as T;
    }

    return payload as T;
  } catch (error) {
    if (error instanceof NewApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new NewApiError(
        didTimeout ? "NewAPI request timed out" : "NewAPI request aborted",
        {
          status: 0,
          code: didTimeout ? "NEWAPI_TIMEOUT" : "NEWAPI_ABORTED",
          cause: error,
        },
      );
    }

    throw new NewApiError("NewAPI request failed", {
      status: 0,
      code: "NEWAPI_REQUEST_FAILED",
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function getAdminHeaders(): Record<string, string> {
  const auth = getNewApiAdminAuth();
  return {
    Authorization: `Bearer ${auth.accessToken}`,
    "New-Api-User": String(auth.userId),
  };
}

export function newApiAdminRequest<T = unknown>(
  path: string,
  options: Omit<NewApiRequestOptions, "auth"> = {},
): Promise<T> {
  return newApiRequest<T>(path, {
    ...options,
    auth: getNewApiAdminAuth(),
  });
}

export function newApiUserRequest<T = unknown>(
  auth: NewApiAuth,
  path: string,
  options: Omit<NewApiRequestOptions, "auth"> = {},
): Promise<T> {
  return newApiRequest<T>(path, {
    ...options,
    auth,
  });
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const { baseUrl } = getNewApiConfig();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

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

function isEnvelope(payload: unknown): payload is NewApiEnvelope {
  return isRecord(payload) && "success" in payload;
}

function newApiHttpError(
  response: Response,
  payload: unknown,
  cause?: unknown,
): NewApiError {
  return new NewApiError(extractMessage(payload) ?? response.statusText, {
    status: response.status,
    statusText: response.statusText,
    code: extractCode(payload),
    payload,
    cause,
  });
}

function newApiEnvelopeError(
  response: Response,
  payload: NewApiEnvelope,
): NewApiError {
  return new NewApiError(payload.message || payload.error || "NewAPI error", {
    status: response.status,
    statusText: response.statusText,
    code: payload.code,
    payload,
  });
}

function extractMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return typeof payload === "string" ? payload : undefined;
  }

  const message = payload.message ?? payload.error ?? payload.msg;
  return typeof message === "string" ? message : undefined;
}

function extractCode(payload: unknown): string | number | boolean | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const code = payload.code;
  return typeof code === "string" ||
    typeof code === "number" ||
    typeof code === "boolean"
    ? code
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
