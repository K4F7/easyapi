import { AuthError, jsonError, jsonOk, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isDevMockEnabled, mockBillingOrdersResponse } from "@/lib/dev-mock";

export const runtime = "nodejs";

export async function GET() {
  if (isDevMockEnabled()) {
    return mockBillingOrdersResponse();
  }

  try {
    const user = await requireUser();
    const orders = await db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        amountCents: true,
        currency: true,
        productCode: true,
        quotaAmount: true,
        provider: true,
        paidAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return jsonOk({
      orders: orders.map((order) => ({
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
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError({ code: error.code, message: error.message }, error.status);
    }

    console.error("billing orders failed", error);
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to list orders" }, 500);
  }
}
