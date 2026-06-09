import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetToken = vi.fn();
const mockRevealTokenKey = vi.fn();
const mockDeleteAllPlaygroundTokensByName = vi.fn();
const mockEnsurePlaygroundChatTokenId = vi.fn();
const mockEnsurePlaygroundImageTokenId = vi.fn();

vi.mock("@/lib/newapi/tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/newapi/tokens")>();

  return {
    ...actual,
    getToken: (...args: unknown[]) => mockGetToken(...args),
    revealTokenKey: (...args: unknown[]) => mockRevealTokenKey(...args),
  };
});

vi.mock("@/lib/playground/ensure-token", () => ({
  deleteAllPlaygroundTokensByName: (...args: unknown[]) =>
    mockDeleteAllPlaygroundTokensByName(...args),
  ensurePlaygroundChatTokenId: (...args: unknown[]) =>
    mockEnsurePlaygroundChatTokenId(...args),
  ensurePlaygroundImageTokenId: (...args: unknown[]) =>
    mockEnsurePlaygroundImageTokenId(...args),
}));

import {
  PlaygroundError,
  resolvePlaygroundKey,
} from "@/lib/newapi/playground";
import { clearPlaygroundKeyCacheForTests } from "@/lib/playground/key-cache";
import type { NewApiAuth } from "@/lib/newapi/types";

const auth: NewApiAuth = {
  accessToken: "newapi-access-token",
  userId: "99",
};

describe("resolvePlaygroundKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPlaygroundKeyCacheForTests();
  });

  it("returns an inline key when getToken already includes the full key", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "Playground Chat",
      status: 1,
      key: "sk-inline-full-key-value",
    });

    await expect(resolvePlaygroundKey(auth, 101)).resolves.toBe(
      "sk-inline-full-key-value",
    );
    expect(mockRevealTokenKey).not.toHaveBeenCalled();
  });

  it("accepts token_key when key is absent", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "Playground Chat",
      status: 1,
      token_key: "sk-token-key-field",
    });

    await expect(resolvePlaygroundKey(auth, 101)).resolves.toBe(
      "sk-token-key-field",
    );
    expect(mockRevealTokenKey).not.toHaveBeenCalled();
  });

  it("reveals the key when getToken returns no key", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "Playground Chat",
      status: 1,
    });
    mockRevealTokenKey.mockResolvedValue("sk-revealed-key");

    await expect(resolvePlaygroundKey(auth, 101)).resolves.toBe("sk-revealed-key");
    expect(mockRevealTokenKey).toHaveBeenCalledWith(auth, 101);
  });

  it("uses the cache instead of revealing the key again", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "操练场-Chat",
      status: 1,
      key: "sk-inline-full-key-value",
    });

    await expect(resolvePlaygroundKey(auth, 101)).resolves.toBe(
      "sk-inline-full-key-value",
    );

    mockGetToken.mockClear();
    mockRevealTokenKey.mockRejectedValue(
      new Error("NewAPI did not return a token key"),
    );

    await expect(resolvePlaygroundKey(auth, 101)).resolves.toBe(
      "sk-inline-full-key-value",
    );
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockRevealTokenKey).not.toHaveBeenCalled();
  });

  it("reveals the key when getToken returns an asterisk-masked key", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "Playground Chat",
      status: 1,
      key: "NmXg**********W14g",
    });
    mockRevealTokenKey.mockResolvedValue("sk-revealed-key");

    await expect(resolvePlaygroundKey(auth, 101)).resolves.toBe("sk-revealed-key");
    expect(mockRevealTokenKey).toHaveBeenCalledWith(auth, 101);
  });

  it("reveals the key when getToken returns a masked key", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "Playground Chat",
      status: 1,
      key: "sk-abcd...wxyz",
    });
    mockRevealTokenKey.mockResolvedValue("sk-revealed-key");

    await expect(resolvePlaygroundKey(auth, 101)).resolves.toBe("sk-revealed-key");
    expect(mockRevealTokenKey).toHaveBeenCalledWith(auth, 101);
  });

  it("rejects disabled tokens before revealing the key", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "Playground Chat",
      status: 2,
    });

    await expect(resolvePlaygroundKey(auth, 101)).rejects.toMatchObject({
      name: "PlaygroundError",
      message: "所选令牌不可用",
      status: 403,
    });
    expect(mockRevealTokenKey).not.toHaveBeenCalled();
  });

  it("returns 409 when reveal key fails for a non-managed token", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "My API Key",
      status: 1,
    });
    mockRevealTokenKey.mockRejectedValue(new Error("NewAPI did not return a token key"));

    await expect(resolvePlaygroundKey(auth, 101)).rejects.toBeInstanceOf(
      PlaygroundError,
    );
    await expect(resolvePlaygroundKey(auth, 101)).rejects.toMatchObject({
      message: "所选令牌无法用于 Playground",
      status: 409,
    });
  });

  it("reprovisions managed chat tokens when reveal key fails", async () => {
    mockGetToken
      .mockResolvedValueOnce({
        id: 101,
        name: "操练场-Chat",
        status: 1,
      })
      .mockResolvedValueOnce({
        id: 202,
        name: "操练场-Chat",
        status: 1,
        key: "sk-recovered-chat-key",
      });
    mockRevealTokenKey.mockRejectedValue(new Error("NewAPI did not return a token key"));
    mockDeleteAllPlaygroundTokensByName.mockResolvedValue(undefined);
    mockEnsurePlaygroundChatTokenId.mockResolvedValue(202);

    await expect(resolvePlaygroundKey(auth, 101)).resolves.toBe(
      "sk-recovered-chat-key",
    );
    expect(mockDeleteAllPlaygroundTokensByName).toHaveBeenCalledWith(
      auth,
      "操练场-Chat",
    );
    expect(mockEnsurePlaygroundChatTokenId).toHaveBeenCalledWith(auth);
  });
});
