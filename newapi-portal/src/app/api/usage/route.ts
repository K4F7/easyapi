import { jsonError, jsonOk, requireUser } from "@/lib/auth";
import { isDevMockEnabled, mockUsageRouteResponse } from "@/lib/dev-mock";
import {
  getUserNewApiAuth,
  handleApiError,
  parseOptionalInt,
} from "@/lib/api/bff";
import { getUsageData } from "@/lib/newapi";
import {
  nowTimestamp,
  startOfWeekTimestamp,
  summarizeUsage,
} from "@/lib/quota/usage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (isDevMockEnabled()) {
    return mockUsageRouteResponse();
  }

  try {
    const user = await requireUser();
    const authResult = await getUserNewApiAuth(user);

    if (!authResult.ok) {
      return jsonError(
        {
          code: authResult.code,
          message: authResult.message,
        },
        409,
      );
    }

    const url = new URL(request.url);
    const startTimestamp =
      parseOptionalInt(url.searchParams.get("start_timestamp")) ??
      startOfWeekTimestamp();
    const endTimestamp =
      parseOptionalInt(url.searchParams.get("end_timestamp")) ?? nowTimestamp();
    const defaultTime = url.searchParams.get("default_time") ?? undefined;
    const items = await getUsageData(authResult.auth, {
      start_timestamp: startTimestamp,
      end_timestamp: endTimestamp,
      default_time: defaultTime,
    });

    return jsonOk({
      items,
      totals: summarizeUsage(items),
      query: {
        start_timestamp: startTimestamp,
        end_timestamp: endTimestamp,
        default_time: defaultTime ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load usage");
  }
}
