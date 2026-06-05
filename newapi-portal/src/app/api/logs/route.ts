import { jsonError, jsonOk, requireUser } from "@/lib/auth";
import {
  getUserNewApiAuth,
  handleApiError,
  parseOptionalInt,
  parsePositiveInt,
} from "@/lib/api/bff";
import { isDevMockEnabled, mockLogsRouteResponse } from "@/lib/dev-mock";
import { getLogs, type NewApiLog } from "@/lib/newapi";
import { normalizePage, summarizeLogs } from "@/lib/quota/usage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (isDevMockEnabled()) {
    return mockLogsRouteResponse(request);
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
    const page = parsePositiveInt(url.searchParams.get("p"), 1, 10_000);
    const pageSize = parsePositiveInt(url.searchParams.get("page_size"), 20, 100);
    const logsPage = normalizePage<NewApiLog>(
      await getLogs(authResult.auth, {
        p: page,
        page_size: pageSize,
        type: parseOptionalInt(url.searchParams.get("type")),
        token_name: url.searchParams.get("token_name") ?? undefined,
        model_name: url.searchParams.get("model_name") ?? undefined,
        start_timestamp: parseOptionalInt(url.searchParams.get("start_timestamp")),
        end_timestamp: parseOptionalInt(url.searchParams.get("end_timestamp")),
        group: url.searchParams.get("group") ?? undefined,
        request_id: url.searchParams.get("request_id") ?? undefined,
      }),
      page,
      pageSize,
    );

    return jsonOk({
      ...logsPage,
      totals: summarizeLogs(logsPage.items),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load logs");
  }
}
