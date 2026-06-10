import "server-only";

import { z } from "zod";

import { jsonError, readJson, requireUser } from "@/lib/auth";
import {
  getPortalUserForApi,
  getUserNewApiAuth,
  handleApiError,
  publicUserFromPortalUser,
} from "@/lib/api/bff";
import {
  isDevMockEnabled,
  mockImageGenerationOptions,
  mockImageGenerationResponse,
} from "@/lib/dev-mock";
import { getNewApiConfig, NewApiError, type NewApiAuth } from "@/lib/newapi";
import {
  createImageGeneration,
  PlaygroundError,
  resolvePlaygroundKey,
} from "@/lib/newapi/playground";
import {
  assertImageSessionTokenOrigins,
  imageSessionTokenPrefix,
  PlaygroundImageSessionTokenError,
  verifyPlaygroundImageSessionToken,
} from "@/lib/playground/image-session-token";

const TOKEN_MARKER_PREFIX = "portal-token-";
const SIGNED_TOKEN_QUERY_PARAM = "playgroundSessionToken";

const imageGenerationSchema = z
  .object({
    tokenId: z
      .preprocess(
        (value) => (typeof value === "string" ? Number(value) : value),
        z.number().int().positive(),
      )
      .optional(),
    playgroundSessionToken: z.string().trim().min(1).optional(),
    prompt: z.string().trim().min(1).max(32_000),
  })
  .passthrough();

export async function handleImageGeneration(request: Request) {
  if (isDevMockEnabled()) {
    return mockImageGenerationResponse(request);
  }

  try {
    const parsedBody = await readJson(request, imageGenerationSchema);
    const context = await resolveImageRequestContext(request, parsedBody);

    if (!context.ok) {
      return withCors(context.response, request);
    }

    const upstreamBody = { ...parsedBody };
    delete upstreamBody.tokenId;
    delete upstreamBody.playgroundSessionToken;
    const key = await resolvePlaygroundKey(context.auth, context.tokenId);
    const { baseUrl } = getNewApiConfig();
    const upstream = await createImageGeneration(
      baseUrl,
      key,
      upstreamBody,
      request.signal,
    );

    if (!upstream.ok) {
      return withCors(
        jsonError(
          {
            code: "UPSTREAM_ERROR",
            message: resolveImageUpstreamErrorMessage(upstream.status),
            details: { status: upstream.status },
          },
          502,
        ),
        request,
      );
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders(upstream, request),
    });
  } catch (error) {
    if (error instanceof PlaygroundError) {
      return withCors(
        jsonError(
          { code: "PLAYGROUND_ERROR", message: error.message },
          error.status,
        ),
        request,
      );
    }
    if (error instanceof PlaygroundImageSessionTokenError) {
      return withCors(
        jsonError(
          {
            code: error.code,
            message:
              error.code === "EXPIRED_IMAGE_SESSION_TOKEN"
                ? "生图会话已过期，请重新打开 Playground"
                : "生图会话无效，请重新打开 Playground",
          },
          401,
        ),
        request,
      );
    }
    if (error instanceof NewApiError) {
      return withCors(
        jsonError(
          {
            code: "TOKEN_RESOLUTION_FAILED",
            message: "无法解析所选令牌，请稍后重试",
            details: {
              status: error.status,
              code: error.code,
            },
          },
          502,
        ),
        request,
      );
    }
    return withCors(
      handleApiError(error, "Failed to generate playground image"),
      request,
    );
  }
}

export function handleImageGenerationOptions(request: Request) {
  if (isDevMockEnabled()) {
    return mockImageGenerationOptions(request);
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

type ParsedImageGenerationBody = z.infer<typeof imageGenerationSchema>;

type ImageRequestContext =
  | {
      ok: true;
      auth: NewApiAuth;
      tokenId: number;
    }
  | {
      ok: false;
      response: Response;
    };

async function resolveImageRequestContext(
  request: Request,
  body: ParsedImageGenerationBody,
): Promise<ImageRequestContext> {
  const signedToken = resolveSignedSessionToken(request, body);

  if (signedToken) {
    try {
      return await resolveSignedImageRequestContext(request, signedToken);
    } catch (error) {
      if (
        !(
          error instanceof PlaygroundImageSessionTokenError &&
          error.code === "INVALID_IMAGE_SESSION_TOKEN" &&
          isSameOriginRequest(request)
        )
      ) {
        throw error;
      }
      // Proxy/origin drift can invalidate an otherwise legitimate embed session.
      // Fall back to the same-origin portal session path below.
    }
  }

  if (!isSameOriginRequest(request)) {
    return {
      ok: false,
      response: jsonError(
        {
          code: "IMAGE_SESSION_TOKEN_REQUIRED",
          message: "跨域生图请求必须使用有效的生图会话",
        },
        401,
      ),
    };
  }

  const tokenId = resolveSessionTokenId(request, body.tokenId);

  if (!tokenId) {
    return {
      ok: false,
      response: jsonError(
        { code: "INVALID_TOKEN_ID", message: "缺少有效的 tokenId" },
        400,
      ),
    };
  }

  const user = await requireUser();
  const authResult = await getUserNewApiAuth(user);

  if (!authResult.ok) {
    return {
      ok: false,
      response: jsonError(
        {
          code: authResult.code,
          message: authResult.message,
        },
        409,
      ),
    };
  }

  return {
    ok: true,
    auth: authResult.auth,
    tokenId,
  };
}

async function resolveSignedImageRequestContext(
  request: Request,
  signedToken: string,
): Promise<ImageRequestContext> {
  const payload = verifyPlaygroundImageSessionToken(signedToken);
  assertImageSessionTokenOrigins(payload, request);
  const portalUser = await getPortalUserForApi(payload.userId);
  const authResult = await getUserNewApiAuth(
    publicUserFromPortalUser(portalUser),
  );

  if (!authResult.ok) {
    return {
      ok: false,
      response: jsonError(
        {
          code: authResult.code,
          message: authResult.message,
        },
        409,
      ),
    };
  }

  return {
    ok: true,
    auth: authResult.auth,
    tokenId: payload.tokenId,
  };
}

function resolveSignedSessionToken(
  request: Request,
  body: ParsedImageGenerationBody,
): string | null {
  if (body.playgroundSessionToken) {
    return body.playgroundSessionToken;
  }

  const url = new URL(request.url);
  const queryToken =
    url.searchParams.get(SIGNED_TOKEN_QUERY_PARAM) ??
    url.searchParams.get("imageSessionToken");

  if (queryToken) {
    return queryToken;
  }

  const bearer = parseAuthorizationBearer(request.headers.get("authorization"));
  return bearer?.startsWith(imageSessionTokenPrefix) ? bearer : null;
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function resolveSessionTokenId(
  request: Request,
  bodyTokenId?: number,
): number | null {
  if (bodyTokenId !== undefined) {
    return bodyTokenId;
  }

  const url = new URL(request.url);
  const queryTokenId = parseTokenId(url.searchParams.get("tokenId"));
  if (queryTokenId) {
    return queryTokenId;
  }

  return parseAuthorizationTokenId(request.headers.get("authorization"));
}

function parseAuthorizationTokenId(value: string | null): number | null {
  const marker = parseAuthorizationBearer(value);
  if (!marker?.toLowerCase().startsWith(TOKEN_MARKER_PREFIX)) {
    return null;
  }

  return parseTokenId(marker.slice(TOKEN_MARKER_PREFIX.length));
}

function parseAuthorizationBearer(value: string | null): string | null {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function parseTokenId(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const tokenId = Number(value);
  return Number.isInteger(tokenId) && tokenId > 0 ? tokenId : null;
}

function responseHeaders(upstream: Response, request: Request): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
  });
  const contentType = upstream.headers.get("content-type");

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  applyCors(headers, request);
  return headers;
}

function withCors<T extends Response>(response: T, request: Request): T {
  applyCors(response.headers, request);
  return response;
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  });

  const allowedOrigin = resolveAllowedOrigin(request);
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }

  return headers;
}

function applyCors(headers: Headers, request: Request) {
  for (const [key, value] of corsHeaders(request)) {
    headers.set(key, value);
  }
}

function resolveAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  const requestOrigin = new URL(request.url).origin;
  if (origin === requestOrigin) {
    return origin;
  }

  return null;
}

function resolveImageUpstreamErrorMessage(status: number): string {
  if (status >= 300 && status < 400) {
    return "NEWAPI_BASE_URL 未指向 OpenAI 兼容 API（生图请求被重定向，请检查是否误用了 Portal 公网地址）";
  }

  if (status === 401 || status === 403) {
    return "令牌密钥无效或无权访问生图接口";
  }

  if (status === 503) {
    return "上游生图服务暂不可用，请稍后重试";
  }

  return `上游生图接口返回错误（HTTP ${status}），请稍后重试`;
}
