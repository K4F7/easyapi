import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { jsonError, jsonOk, requireUser } from "@/lib/auth";
import { isDevMockEnabled } from "@/lib/dev-mock";
import { getAffInfo, transferAffQuota } from "@/lib/newapi/aff";
import { getSelf, NewApiError } from "@/lib/newapi";

export const runtime = "nodejs";

export async function GET() {
  if (isDevMockEnabled()) {
    return jsonOk({
      aff_code: "DEVMOCK",
      aff_count: 0,
      aff_quota: 0,
      aff_history_quota: 0,
    });
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

    const [affInfo, self] = await Promise.all([
      getAffInfo(authResult.auth).catch(() => null),
      getSelf(authResult.auth),
    ]);

    const affCode =
      affInfo?.aff_code ||
      (typeof self.aff_code === "string" ? self.aff_code : "") ||
      "";

    return jsonOk({
      aff_code: affCode,
      aff_count:
        affInfo?.aff_count ??
        (typeof self.aff_count === "number" ? self.aff_count : 0),
      aff_quota:
        affInfo?.aff_quota ??
        (typeof self.aff_quota === "number" ? self.aff_quota : 0),
      aff_history_quota:
        affInfo?.aff_history_quota ??
        (typeof self.aff_history_quota === "number"
          ? self.aff_history_quota
          : 0),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load affiliate info");
  }
}

export async function POST() {
  if (isDevMockEnabled()) {
    return jsonOk({
      transferred: true,
      transferred_quota: 0,
    });
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

    const result = await transferAffQuota(authResult.auth);

    return jsonOk({
      transferred: true,
      transferred_quota: result.transferred_quota ?? result.quota ?? 0,
      aff_quota: result.aff_quota ?? null,
    });
  } catch (error) {
    if (error instanceof NewApiError) {
      return jsonError(
        {
          code: "AFF_TRANSFER_FAILED",
          message: error.message || "划转返利额度失败",
        },
        error.status && error.status >= 400 && error.status < 500
          ? error.status
          : 502,
      );
    }

    return handleApiError(error, "Failed to transfer affiliate quota");
  }
}
