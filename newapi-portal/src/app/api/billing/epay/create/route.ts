import { Prisma } from "@prisma/client";
import { z } from "zod";

import { AuthError, jsonError, jsonOk, readJson, requireUser, zodErrorResponse } from "@/lib/auth";
import { getUserNewApiAuth } from "@/lib/api/bff";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { newApiUserRequest } from "@/lib/newapi";
import { NewApiError } from "@/lib/newapi/client";

export const runtime = "nodejs";

const createOrderSchema = z.object({
  amount: z.union([z.string(), z.number()]).optional(),
  amountCents: z.number().int().positive().optional(),
  type: z.string().trim().min(1).max(32).optional(),
  payType: z.string().trim().min(1).max(32).optional(),
  payment_method: z.string().trim().min(1).max(32).optional(),
  paymentMethod: z.string().trim().min(1).max(32).optional(),
  productCode: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(128).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
}).refine((value) => value.amount !== undefined || value.amountCents !== undefined, {
  message: "amount or amountCents is required",
  path: ["amount"],
});

type NewApiPayResponse = {
  message?: string;
  data?: unknown;
  url?: string;
  [key: string]: unknown;
};

export async function POST(request: Request) {
  try {
    const publicUser = await requireUser();
    const authResult = await getUserNewApiAuth(publicUser);

    if (!authResult.ok) {
      return jsonError(
        {
          code: authResult.code,
          message: authResult.message,
        },
        409,
      );
    }

    const input = await readJson(request, createOrderSchema);
    const amountResult = parseNewApiTopupAmount(input);

    if (!amountResult.ok) {
      return jsonError(
        {
          code: "VALIDATION_ERROR",
          message: amountResult.message,
        },
        400,
      );
    }

    const env = getServerEnv();
    const paymentMethod = input.payment_method ?? input.paymentMethod ?? input.payType ?? input.type ?? "alipay";
    const returnUrl = new URL("/dashboard/billing?payment=return", env.APP_URL).toString();
    const idempotencyKey = buildIdempotencyKey(publicUser.id, input.idempotencyKey ?? request.headers.get("Idempotency-Key"));
    const existingOrder = idempotencyKey
      ? await db.order.findUnique({
          where: { idempotencyKey },
        })
      : null;

    if (existingOrder) {
      if (existingOrder.userId !== publicUser.id || existingOrder.amountCents !== amountResult.amountCents) {
        return jsonError(
          {
            code: "IDEMPOTENCY_CONFLICT",
            message: "Idempotency key was already used for a different payment request",
          },
          409,
        );
      }

      const cachedPayment = readCachedPayment(existingOrder.metadata);

      if (!cachedPayment) {
        return jsonError(
          {
            code: "PAYMENT_CACHE_MISSING",
            message: "Payment request was already recorded but no payment URL is cached",
          },
          409,
        );
      }

      return jsonOk({
        order: serializeOrder(existingOrder),
        payment: cachedPayment,
      });
    }

    const upstream = await newApiUserRequest<NewApiPayResponse>(authResult.auth, "/api/user/pay", {
      method: "POST",
      json: {
        amount: amountResult.amount,
        payment_method: paymentMethod,
        return_url: returnUrl,
      },
    });

    if (upstream.message && upstream.message !== "success") {
      return jsonError(
        {
          code: "NEWAPI_PAYMENT_FAILED",
          message: extractUpstreamMessage(upstream) ?? "NewAPI failed to create payment",
        },
        502,
      );
    }

    const payment = buildPaymentFromNewApiResponse(upstream);

    if (!payment) {
      return jsonError(
        {
          code: "NEWAPI_PAYMENT_RESPONSE_INVALID",
          message: "NewAPI payment response did not include a payment URL",
        },
        502,
      );
    }

    const order = await db.order.create({
      data: {
        userId: publicUser.id,
        status: "PENDING",
        amountCents: amountResult.amountCents,
        currency: "CNY",
        productCode: input.productCode ?? "quota",
        quotaAmount: null,
        idempotencyKey,
        provider: "newapi:epay",
        metadata: {
          source: "newapi_user_pay",
          paymentMethod,
          newApiAmount: amountResult.amount,
          returnUrl,
          payment,
          upstream: {
            message: upstream.message ?? null,
            url: upstream.url ?? null,
            data: recordFromUnknown(upstream.data),
          },
        } satisfies Prisma.InputJsonObject,
      },
    });

    return jsonOk(
      {
        order: serializeOrder(order),
        payment,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError({ code: error.code, message: error.message }, error.status);
    }

    if (error instanceof z.ZodError) {
      return zodErrorResponse(error);
    }

    if (error instanceof NewApiError) {
      return jsonError(
        {
          code: "NEWAPI_PAYMENT_FAILED",
          message: error.message || "NewAPI failed to create payment",
        },
        error.status && error.status >= 400 ? error.status : 502,
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(
        {
          code: "ORDER_CONFLICT",
          message: "Payment request idempotency key already exists",
        },
        409,
      );
    }

    console.error("billing epay create failed", error);
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to create payment request" }, 500);
  }
}

function parseNewApiTopupAmount(input: z.infer<typeof createOrderSchema>):
  | { ok: true; amount: number; amountCents: number }
  | { ok: false; message: string } {
  if (input.amount !== undefined) {
    const amount = parsePositiveInteger(input.amount);

    if (amount === null) {
      return { ok: false, message: "amount must be a positive integer supported by NewAPI top-up" };
    }

    return { ok: true, amount, amountCents: amount * 100 };
  }

  if (input.amountCents === undefined || input.amountCents % 100 !== 0) {
    return { ok: false, message: "amountCents must be a whole CNY amount for NewAPI top-up" };
  }

  return { ok: true, amount: input.amountCents / 100, amountCents: input.amountCents };
}

function parsePositiveInteger(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildPaymentFromNewApiResponse(upstream: NewApiPayResponse) {
  const action = typeof upstream.url === "string" ? upstream.url : null;

  if (!action) {
    return null;
  }

  const params = recordFromUnknown(upstream.data);
  const url = appendParams(action, params);

  return {
    method: "GET" as const,
    action,
    params,
    url,
  };
}

function appendParams(action: string, params: Record<string, string>): string {
  const url = new URL(action);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function recordFromUnknown(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const params: Record<string, string> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue !== null && entryValue !== undefined) {
      params[key] = String(entryValue);
    }
  }

  return params;
}

function readCachedPayment(metadata: Prisma.JsonValue) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  const payment = metadata.payment;

  if (typeof payment !== "object" || payment === null || Array.isArray(payment)) {
    return null;
  }

  const method = payment.method;
  const action = payment.action;
  const url = payment.url;

  if (method !== "GET" || typeof action !== "string" || typeof url !== "string") {
    return null;
  }

  return {
    method,
    action,
    params: recordFromUnknown(payment.params),
    url,
  };
}

function serializeOrder(order: {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  productCode: string | null;
  quotaAmount: number | null;
  provider: string | null;
  paidAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: order.id,
    status: order.status,
    amountCents: order.amountCents,
    currency: order.currency,
    productCode: order.productCode,
    quotaAmount: order.quotaAmount,
    provider: order.provider,
    paidAt: order.paidAt?.toISOString() ?? null,
    expiresAt: order.expiresAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}

function buildIdempotencyKey(userId: string, key: string | null | undefined): string | null {
  const normalized = key?.trim();

  if (!normalized) {
    return null;
  }

  return `newapi:epay:create:${userId}:${normalized}`;
}

function extractUpstreamMessage(upstream: NewApiPayResponse): string | null {
  if (typeof upstream.data === "string") {
    return upstream.data;
  }

  if (typeof upstream.error === "string") {
    return upstream.error;
  }

  return null;
}
