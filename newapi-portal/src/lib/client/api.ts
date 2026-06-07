"use client";

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

type ApiEnvelope<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: ApiError;
    };

export class ClientApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : undefined),
      ...init?.headers,
    },
  });
  const envelope = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | null;

  if (!response.ok || !envelope?.ok) {
    const error =
      envelope && !envelope.ok
        ? envelope.error
        : {
            code: "REQUEST_FAILED",
            message: "请求失败，请稍后重试",
          };

    throw new ClientApiError(error, response.status);
  }

  return envelope.data;
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, {
    method: "DELETE",
  });
}
