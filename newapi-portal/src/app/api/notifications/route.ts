import { handleApiError } from "@/lib/api/bff";
import { jsonOk } from "@/lib/auth";
import { isDevMockEnabled, mockNotificationsResponse } from "@/lib/dev-mock";
import { getNewApiNotice } from "@/lib/newapi/notice";

export const runtime = "nodejs";

export async function GET() {
  if (isDevMockEnabled()) {
    return mockNotificationsResponse();
  }

  try {
    const notice = await getNewApiNotice();

    return jsonOk({
      content: notice?.content ?? "",
      contentHash: notice?.contentHash ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load notifications");
  }
}
