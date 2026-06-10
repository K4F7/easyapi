import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { getRequestBaseUrl } from "@/lib/http/request-base-url";
import { getAuthSecret } from "@/lib/env";

export const imageSessionTokenPrefix = "portal-image-session-v1.";
export const imageSessionTokenTtlSeconds = 10 * 60;

const imageSessionAudience = "playground-images";

const imageSessionPayloadSchema = z.object({
  aud: z.literal(imageSessionAudience),
  userId: z.string().min(1),
  tokenId: z.number().int().positive(),
  portalOrigin: z.string().min(1),
  playgroundOrigin: z.string().min(1),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

export type PlaygroundImageSessionPayload = z.infer<
  typeof imageSessionPayloadSchema
>;

export class PlaygroundImageSessionTokenError extends Error {
  readonly code: "INVALID_IMAGE_SESSION_TOKEN" | "EXPIRED_IMAGE_SESSION_TOKEN";

  constructor(
    code: "INVALID_IMAGE_SESSION_TOKEN" | "EXPIRED_IMAGE_SESSION_TOKEN",
    message: string,
  ) {
    super(message);
    this.name = "PlaygroundImageSessionTokenError";
    this.code = code;
  }
}

export function signPlaygroundImageSessionToken(
  input: Pick<
    PlaygroundImageSessionPayload,
    "userId" | "tokenId" | "portalOrigin" | "playgroundOrigin"
  >,
  nowSeconds = currentUnixSeconds(),
): string {
  const payload: PlaygroundImageSessionPayload = {
    aud: imageSessionAudience,
    userId: input.userId,
    tokenId: input.tokenId,
    portalOrigin: input.portalOrigin,
    playgroundOrigin: input.playgroundOrigin,
    iat: nowSeconds,
    exp: nowSeconds + imageSessionTokenTtlSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);

  return `${imageSessionTokenPrefix}${encodedPayload}.${signature}`;
}

export function verifyPlaygroundImageSessionToken(
  token: string,
  nowSeconds = currentUnixSeconds(),
): PlaygroundImageSessionPayload {
  if (!token.startsWith(imageSessionTokenPrefix)) {
    throw new PlaygroundImageSessionTokenError(
      "INVALID_IMAGE_SESSION_TOKEN",
      "Invalid image session token",
    );
  }

  const rawToken = token.slice(imageSessionTokenPrefix.length);
  const separatorIndex = rawToken.lastIndexOf(".");

  if (separatorIndex < 1 || separatorIndex === rawToken.length - 1) {
    throw new PlaygroundImageSessionTokenError(
      "INVALID_IMAGE_SESSION_TOKEN",
      "Invalid image session token",
    );
  }

  const encodedPayload = rawToken.slice(0, separatorIndex);
  const signature = rawToken.slice(separatorIndex + 1);

  if (!verifySignature(encodedPayload, signature)) {
    throw new PlaygroundImageSessionTokenError(
      "INVALID_IMAGE_SESSION_TOKEN",
      "Invalid image session token",
    );
  }

  const payload = parsePayload(encodedPayload);

  if (payload.exp <= nowSeconds) {
    throw new PlaygroundImageSessionTokenError(
      "EXPIRED_IMAGE_SESSION_TOKEN",
      "Image session token has expired",
    );
  }

  return payload;
}

export function assertImageSessionTokenOrigins(
  payload: PlaygroundImageSessionPayload,
  request: Request,
): void {
  const portalOrigin = getRequestBaseUrl(request);

  if (payload.portalOrigin !== portalOrigin) {
    throw new PlaygroundImageSessionTokenError(
      "INVALID_IMAGE_SESSION_TOKEN",
      "Image session token was not issued for this portal",
    );
  }

  const requestOrigin = request.headers.get("origin");
  if (
    requestOrigin &&
    requestOrigin !== payload.playgroundOrigin &&
    requestOrigin !== portalOrigin
  ) {
    throw new PlaygroundImageSessionTokenError(
      "INVALID_IMAGE_SESSION_TOKEN",
      "Image session token was not issued for this playground origin",
    );
  }
}

function parsePayload(encodedPayload: string): PlaygroundImageSessionPayload {
  try {
    const rawPayload = Buffer.from(encodedPayload, "base64url").toString(
      "utf8",
    );
    return imageSessionPayloadSchema.parse(JSON.parse(rawPayload));
  } catch {
    throw new PlaygroundImageSessionTokenError(
      "INVALID_IMAGE_SESSION_TOKEN",
      "Invalid image session token",
    );
  }
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function verifySignature(encodedPayload: string, signature: string): boolean {
  const expected = sign(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
