import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NewApiAuth, NewApiToken } from "@/lib/newapi/types";

const mockListTokens = vi.fn();
const mockCreateToken = vi.fn();
const mockUpdateToken = vi.fn();

vi.mock("@/lib/newapi", () => ({
  listTokens: (...args: unknown[]) => mockListTokens(...args),
  createToken: (...args: unknown[]) => mockCreateToken(...args),
  updateToken: (...args: unknown[]) => mockUpdateToken(...args),
}));

import {
  ensurePlaygroundChatTokenId,
  ensurePlaygroundImageTokenId,
  ensurePlaygroundTokenIds,
  PLAYGROUND_CHAT_TOKEN_NAME,
  PLAYGROUND_IMAGE_MODEL_LIMITS,
  PLAYGROUND_IMAGE_TOKEN_NAME,
} from "@/lib/playground/ensure-token";

const auth: NewApiAuth = {
  accessToken: "newapi-access-token",
  userId: "99",
};

function token(input: Partial<NewApiToken> & Pick<NewApiToken, "id" | "name">) {
  return {
    status: 1,
    unlimited_quota: true,
    cross_group_retry: true,
    group: "auto",
    ...input,
  } satisfies NewApiToken;
}

describe("ensure playground tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("scans token pages before creating a chat token", async () => {
    mockListTokens
      .mockResolvedValueOnce({
        items: Array.from({ length: 100 }, (_, index) =>
          token({ id: index + 1, name: `Token ${index + 1}` }),
        ),
        total: 101,
      })
      .mockResolvedValueOnce({
        items: [token({ id: 202, name: PLAYGROUND_CHAT_TOKEN_NAME })],
        total: 101,
      });

    await expect(ensurePlaygroundChatTokenId(auth)).resolves.toBe(202);
    expect(mockListTokens).toHaveBeenCalledTimes(2);
    expect(mockListTokens).toHaveBeenNthCalledWith(1, auth, {
      p: 1,
      size: 100,
    });
    expect(mockListTokens).toHaveBeenNthCalledWith(2, auth, {
      p: 2,
      size: 100,
    });
    expect(mockCreateToken).not.toHaveBeenCalled();
    expect(mockUpdateToken).not.toHaveBeenCalled();
  });

  it("updates a usable restricted chat token after skipping disabled, expired, and exhausted tokens", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockListTokens.mockResolvedValueOnce({
      items: [
        token({ id: 1, name: PLAYGROUND_CHAT_TOKEN_NAME, status: 2 }),
        token({
          id: 2,
          name: PLAYGROUND_CHAT_TOKEN_NAME,
          expired_time: now - 1,
        }),
        token({
          id: 3,
          name: PLAYGROUND_CHAT_TOKEN_NAME,
          unlimited_quota: false,
          remain_quota: 0,
        }),
        token({
          id: 4,
          name: PLAYGROUND_CHAT_TOKEN_NAME,
          model_limits_enabled: true,
          model_limits: "gpt-4o",
        }),
      ],
      total: 4,
    });

    await expect(ensurePlaygroundChatTokenId(auth)).resolves.toBe(4);
    expect(mockUpdateToken).toHaveBeenCalledWith(auth, {
      id: 4,
      name: PLAYGROUND_CHAT_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: false,
      cross_group_retry: true,
      group: "auto",
    });
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it("does not reuse finite quota playground tokens", async () => {
    mockListTokens.mockResolvedValueOnce({
      items: [
        token({
          id: 31,
          name: PLAYGROUND_CHAT_TOKEN_NAME,
          unlimited_quota: false,
          remain_quota: 1000,
        }),
      ],
      total: 1,
    });
    mockCreateToken.mockResolvedValueOnce({
      token: { id: 313, name: PLAYGROUND_CHAT_TOKEN_NAME },
    });

    await expect(ensurePlaygroundChatTokenId(auth)).resolves.toBe(313);
    expect(mockCreateToken).toHaveBeenCalledWith(auth, {
      name: PLAYGROUND_CHAT_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: false,
      cross_group_retry: true,
      group: "auto",
    });

    mockListTokens.mockResolvedValueOnce({
      items: [
        token({
          id: 32,
          name: PLAYGROUND_IMAGE_TOKEN_NAME,
          unlimited_quota: false,
          remain_quota: 1000,
          model_limits_enabled: true,
          model_limits: "gpt-image-2",
        }),
      ],
      total: 1,
    });
    mockCreateToken.mockResolvedValueOnce({
      token: { id: 323, name: PLAYGROUND_IMAGE_TOKEN_NAME },
    });

    await expect(ensurePlaygroundImageTokenId(auth)).resolves.toBe(323);
    expect(mockCreateToken).toHaveBeenLastCalledWith(auth, {
      name: PLAYGROUND_IMAGE_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: true,
      model_limits: PLAYGROUND_IMAGE_MODEL_LIMITS,
    });
  });

  it("updates a usable chat token without cross group retry", async () => {
    mockListTokens.mockResolvedValueOnce({
      items: [
        token({
          id: 33,
          name: PLAYGROUND_CHAT_TOKEN_NAME,
          cross_group_retry: false,
        }),
      ],
      total: 1,
    });

    await expect(ensurePlaygroundChatTokenId(auth)).resolves.toBe(33);
    expect(mockUpdateToken).toHaveBeenCalledWith(auth, {
      id: 33,
      name: PLAYGROUND_CHAT_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: false,
      cross_group_retry: true,
      group: "auto",
    });
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it("updates a usable chat token assigned to a non-playground group", async () => {
    vi.stubEnv("PLAYGROUND_CHAT_GROUP", "general");
    mockListTokens.mockResolvedValueOnce({
      items: [
        token({
          id: 35,
          name: PLAYGROUND_CHAT_TOKEN_NAME,
          group: "default",
        }),
      ],
      total: 1,
    });

    await expect(ensurePlaygroundChatTokenId(auth)).resolves.toBe(35);
    expect(mockUpdateToken).toHaveBeenCalledWith(auth, {
      id: 35,
      name: PLAYGROUND_CHAT_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: false,
      cross_group_retry: true,
      group: "general",
    });
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it("creates chat tokens with the configured general channel group", async () => {
    vi.stubEnv("CHANNEL_TIER_GENERAL_GROUP", "general");
    mockListTokens.mockResolvedValueOnce({
      items: [],
      total: 0,
    });
    mockCreateToken.mockResolvedValueOnce({
      token: { id: 336, name: PLAYGROUND_CHAT_TOKEN_NAME },
    });

    await expect(ensurePlaygroundChatTokenId(auth)).resolves.toBe(336);
    expect(mockCreateToken).toHaveBeenCalledWith(auth, {
      name: PLAYGROUND_CHAT_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: false,
      cross_group_retry: true,
      group: "general",
    });
    expect(mockUpdateToken).not.toHaveBeenCalled();
  });

  it("prefers a later qualified chat token over updating an earlier stale token", async () => {
    mockListTokens
      .mockResolvedValueOnce({
        items: Array.from({ length: 100 }, (_, index) =>
          index === 0
            ? token({
                id: 36,
                name: PLAYGROUND_CHAT_TOKEN_NAME,
                group: "default",
              })
            : token({ id: 1000 + index, name: `Token ${index}` }),
        ),
        total: 101,
      })
      .mockResolvedValueOnce({
        items: [token({ id: 37, name: PLAYGROUND_CHAT_TOKEN_NAME })],
        total: 101,
      });

    await expect(ensurePlaygroundChatTokenId(auth)).resolves.toBe(37);
    expect(mockUpdateToken).not.toHaveBeenCalled();
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it("updates the first stale chat token when no qualified token exists", async () => {
    mockListTokens
      .mockResolvedValueOnce({
        items: Array.from({ length: 100 }, (_, index) =>
          index === 0
            ? token({
                id: 38,
                name: PLAYGROUND_CHAT_TOKEN_NAME,
                group: "default",
              })
            : token({ id: 1100 + index, name: `Token ${index}` }),
        ),
        total: 101,
      })
      .mockResolvedValueOnce({
        items: [
          token({
            id: 39,
            name: PLAYGROUND_CHAT_TOKEN_NAME,
            group: "default",
          }),
        ],
        total: 101,
      });

    await expect(ensurePlaygroundChatTokenId(auth)).resolves.toBe(38);
    expect(mockUpdateToken).toHaveBeenCalledWith(auth, {
      id: 38,
      name: PLAYGROUND_CHAT_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: false,
      cross_group_retry: true,
      group: "auto",
    });
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it("does not reuse an image token that includes non gpt-image-2 models", async () => {
    mockListTokens.mockResolvedValueOnce({
      items: [
        token({
          id: 34,
          name: PLAYGROUND_IMAGE_TOKEN_NAME,
          model_limits_enabled: true,
          model_limits: "gpt-image-2,gpt-4o",
        }),
      ],
      total: 1,
    });
    mockCreateToken.mockResolvedValueOnce({
      token: { id: 343, name: PLAYGROUND_IMAGE_TOKEN_NAME },
    });

    await expect(ensurePlaygroundImageTokenId(auth)).resolves.toBe(343);
    expect(mockCreateToken).toHaveBeenCalledWith(auth, {
      name: PLAYGROUND_IMAGE_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: true,
      model_limits: PLAYGROUND_IMAGE_MODEL_LIMITS,
    });
  });

  it("creates a dedicated image token with only gpt-image-2 model limits", async () => {
    mockListTokens.mockResolvedValueOnce({
      items: [],
      total: 0,
    });
    mockCreateToken.mockResolvedValueOnce({
      token: { id: 404, name: PLAYGROUND_IMAGE_TOKEN_NAME },
    });

    await expect(ensurePlaygroundImageTokenId(auth)).resolves.toBe(404);
    expect(mockCreateToken).toHaveBeenCalledWith(auth, {
      name: PLAYGROUND_IMAGE_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: true,
      model_limits: PLAYGROUND_IMAGE_MODEL_LIMITS,
    });
  });

  it("reuses a qualified image token and creates a separate chat token", async () => {
    mockListTokens
      .mockResolvedValueOnce({
        items: [],
        total: 0,
      })
      .mockResolvedValueOnce({
        items: [
          token({
            id: 505,
            name: PLAYGROUND_IMAGE_TOKEN_NAME,
            model_limits_enabled: true,
            model_limits: "gpt-image-2,gpt-image-2-mini",
          }),
        ],
        total: 1,
      });
    mockCreateToken.mockResolvedValueOnce({
      token: { id: 606, name: PLAYGROUND_CHAT_TOKEN_NAME },
    });

    await expect(ensurePlaygroundTokenIds(auth)).resolves.toEqual({
      chatTokenId: 606,
      imageTokenId: 505,
    });
  });
});
