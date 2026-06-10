import { AuthError, jsonError, jsonOk, requireUser } from "@/lib/auth";
import { isDevMockEnabled, mockBillingOrdersResponse } from "@/lib/dev-mock";

export const runtime = "nodejs";

export async function GET() {
  if (isDevMockEnabled()) {
    return mockBillingOrdersResponse();
  }

  try {
    await requireUser();

    return jsonOk({
      orders: [],
      message:
        "支付记录以 NewAPI 余额为准；请刷新余额确认到账。历史订单列表暂未对接上游。",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError({ code: error.code, message: error.message }, error.status);
    }

    console.error("billing orders failed", error);
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to list orders" }, 500);
  }
}
