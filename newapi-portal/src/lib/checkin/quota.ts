import { adminAddQuota, NewApiError } from "@/lib/newapi";
import { db } from "@/lib/db";

// Retry budget for the upstream `add_quota` call, executed entirely within the
// check-in request. The first click usually fails on a transient upstream hiccup
// (brief 5xx/timeout, or first-access readiness lag) and succeeds on the second
// click; spending more of that budget on the first request is what lets the
// first click succeed. Backoff is exponential with jitter so concurrent
// check-ins don't synchronize their retries.
//
// Worst-case total wait (no jitter) ≈ 300 + 600 + 1200 + 2400 = 4500ms across
// 5 attempts — comfortably under the 15s per-call upstream timeout in
// newApiRequest, keeping the whole handler responsive.
export const CHECKIN_QUOTA_RETRY_ATTEMPTS = 5;
export const CHECKIN_QUOTA_RETRY_BASE_DELAY_MS = 300;
export const CHECKIN_QUOTA_RETRY_BACKOFF_FACTOR = 2;
export const CHECKIN_QUOTA_RETRY_MAX_DELAY_MS = 2500;
export const CHECKIN_QUOTA_RETRY_JITTER_RATIO = 0.25;

export type CheckinQuotaErrorDetails = {
  status?: number;
  code?: string | number | boolean;
  message: string;
};

// Decide whether retrying the upstream `adminAddQuota` call could plausibly
// succeed.
//
// Retry ONLY transient transport-level failures, which surface as NewApiError
// with status 0 (timeout/abort/network — see client.ts) or HTTP 5xx/429.
//
// Do NOT retry:
//   - Business errors from new-api's /api/user/manage: those come back as
//     HTTP 200 with an envelope `{ success: false }` (NewApiError status 200,
//     see client.ts `newApiEnvelopeError`), e.g. "用户不存在". A 200 envelope
//     error is deterministic and will not heal on retry, so it fails fast.
//   - Other 4xx (auth/validation) — also deterministic.
//   - Non-NewApiError values: these are programming/unexpected errors (e.g. a
//     DB failure), never something to optimistically retry.
export function isRetryableUpstreamError(error: unknown): boolean {
  if (error instanceof NewApiError) {
    return error.status === 0 || error.status >= 500 || error.status === 429;
  }

  return false;
}

export function describeCheckinQuotaError(
  error: unknown,
): CheckinQuotaErrorDetails {
  if (error instanceof NewApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
  };
}

export type ApplyCheckinQuotaInput = {
  newApiUserId: string;
  quotaAmount: number;
  ledgerId: string;
  checkedInKey: string;
};

export type ApplyCheckinQuotaOptions = {
  retryAttempts?: number;
  baseDelayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export function isCheckinQuotaApplied(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return (metadata as { quotaApplied?: boolean }).quotaApplied === true;
}

export async function applyCheckinQuota(
  input: ApplyCheckinQuotaInput,
  options: ApplyCheckinQuotaOptions = {},
) {
  const retryAttempts = options.retryAttempts ?? CHECKIN_QUOTA_RETRY_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? CHECKIN_QUOTA_RETRY_BASE_DELAY_MS;
  const backoffFactor =
    options.backoffFactor ?? CHECKIN_QUOTA_RETRY_BACKOFF_FACTOR;
  const maxDelayMs = options.maxDelayMs ?? CHECKIN_QUOTA_RETRY_MAX_DELAY_MS;
  const jitterRatio = options.jitterRatio ?? CHECKIN_QUOTA_RETRY_JITTER_RATIO;
  const sleepFn = options.sleep ?? defaultSleep;
  const randomFn = options.random ?? Math.random;

  // Only the upstream `adminAddQuota` call is retried — transient upstream
  // failures are what we want to outlast. The ledger update runs once, after
  // the upstream succeeds, so a DB failure never re-triggers the upstream call.
  await retryUpstream(
    () => adminAddQuota({ userId: input.newApiUserId, value: input.quotaAmount }),
    {
      retryAttempts,
      baseDelayMs,
      backoffFactor,
      maxDelayMs,
      jitterRatio,
      sleepFn,
      randomFn,
    },
  );

  await db.walletLedger.update({
    where: { id: input.ledgerId },
    data: {
      metadata: {
        source: "checkin",
        checkedInOn: input.checkedInKey,
        newApiUserId: input.newApiUserId,
        quotaAmount: input.quotaAmount,
        quotaApplied: true,
      },
    },
  });
}

type RetryConfig = {
  retryAttempts: number;
  baseDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  jitterRatio: number;
  sleepFn: (ms: number) => Promise<unknown>;
  randomFn: () => number;
};

async function retryUpstream(
  task: () => Promise<unknown>,
  config: RetryConfig,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
    try {
      await task();
      return;
    } catch (error) {
      lastError = error;

      // Deterministic failures (200-envelope business errors, 4xx, unexpected
      // non-NewApiError) will not heal on retry; fail fast so the caller can
      // surface the real diagnostic instead of stalling.
      if (!isRetryableUpstreamError(error) || attempt >= config.retryAttempts) {
        break;
      }

      await config.sleepFn(computeBackoffDelay(attempt, config));
    }
  }

  throw lastError;
}

// Exponential backoff with full +/- jitter, clamped to maxDelayMs.
function computeBackoffDelay(attempt: number, config: RetryConfig): number {
  const exponential =
    config.baseDelayMs * config.backoffFactor ** (attempt - 1);
  const capped = Math.min(exponential, config.maxDelayMs);
  const jitterSpan = capped * config.jitterRatio;
  // randomFn() in [0,1) -> jitter in [-jitterSpan, +jitterSpan)
  const jitter = (config.randomFn() * 2 - 1) * jitterSpan;

  return Math.max(0, Math.round(capped + jitter));
}

function defaultSleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
