import { z } from "zod";

import { jsonError, readJson, requireUser } from "@/lib/auth";
import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { getNewApiConfig } from "@/lib/newapi";
import {
  PlaygroundError,
  resolvePlaygroundKey,
  streamChatCompletion,
} from "@/lib/newapi/playground";

export const runtime = "nodejs";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

const chatSchema = z.object({
  tokenId: z.number().int().positive(),
  model: z.string().trim().min(1).max(128),
  messages: z.array(messageSchema).min(1).max(200),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().positive().max(32_000).optional(),
});

export async function POST(request: Request) {
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

    const { tokenId, ...body } = await readJson(request, chatSchema);
    const key = await resolvePlaygroundKey(authResult.auth, tokenId);
    const { baseUrl } = getNewApiConfig();

    const upstream = await streamChatCompletion(
      baseUrl,
      key,
      body,
      request.signal,
    );

    if (!upstream.ok || !upstream.body) {
      return jsonError(
        {
          code: "UPSTREAM_ERROR",
          message: "上游对话接口返回错误，请稍后重试",
          details: { status: upstream.status },
        },
        502,
      );
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof PlaygroundError) {
      return jsonError(
        { code: "PLAYGROUND_ERROR", message: error.message },
        error.status,
      );
    }
    return handleApiError(error, "Failed to start chat completion");
  }
}
