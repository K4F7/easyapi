import { jsonError, jsonOk, requireUser } from "@/lib/auth";
import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { isDevMockEnabled, mockPlaygroundModelsResponse } from "@/lib/dev-mock";
import { getNewApiConfig } from "@/lib/newapi";
import {
  PlaygroundError,
  listUpstreamModels,
  resolvePlaygroundKey,
} from "@/lib/newapi/playground";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (isDevMockEnabled()) {
    return mockPlaygroundModelsResponse();
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
    const tokenIdRaw = url.searchParams.get("tokenId");
    const tokenId = tokenIdRaw ? Number(tokenIdRaw) : NaN;

    if (!Number.isInteger(tokenId) || tokenId < 1) {
      return jsonError(
        { code: "INVALID_TOKEN_ID", message: "缺少有效的 tokenId" },
        400,
      );
    }

    const key = await resolvePlaygroundKey(authResult.auth, tokenId);
    const { baseUrl } = getNewApiConfig();

    const models = await listUpstreamModels(baseUrl, key);
    if (models.length === 0) {
      return jsonError(
        { code: "NO_MODELS", message: "上游未返回可用模型" },
        502,
      );
    }

    return jsonOk({ models, fallback: false });
  } catch (error) {
    if (error instanceof PlaygroundError) {
      return jsonError(
        { code: "PLAYGROUND_ERROR", message: error.message },
        error.status,
      );
    }
    return handleApiError(error, "Failed to list playground models");
  }
}
