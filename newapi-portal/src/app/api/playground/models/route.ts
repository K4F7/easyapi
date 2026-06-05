import { jsonError, jsonOk, requireUser } from "@/lib/auth";
import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { getNewApiConfig } from "@/lib/newapi";
import {
  PlaygroundError,
  listUpstreamModels,
  resolvePlaygroundKey,
} from "@/lib/newapi/playground";

export const runtime = "nodejs";

/** 上游 `/v1/models` 不可用时的兜底精选列表。 */
const FALLBACK_MODELS: { id: string }[] = [
  { id: "gpt-4o" },
  { id: "gpt-4o-mini" },
  { id: "gpt-4.1" },
  { id: "gpt-4.1-mini" },
  { id: "o3-mini" },
  { id: "claude-3-7-sonnet-20250219" },
  { id: "claude-sonnet-4-20250514" },
  { id: "deepseek-chat" },
  { id: "deepseek-reasoner" },
];

export async function GET(request: Request) {
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

    try {
      const models = await listUpstreamModels(baseUrl, key);
      if (models.length === 0) {
        return jsonOk({ models: FALLBACK_MODELS, fallback: true });
      }
      return jsonOk({ models, fallback: false });
    } catch (modelError) {
      // 上游 /v1/models 不允许 token key 访问或不存在：兜底固定精选列表。
      if (modelError instanceof PlaygroundError) {
        return jsonOk({ models: FALLBACK_MODELS, fallback: true });
      }
      throw modelError;
    }
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
