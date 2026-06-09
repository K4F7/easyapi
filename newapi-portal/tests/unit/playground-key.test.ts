import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetToken = vi.fn();
const mockRevealTokenKey = vi.fn();

vi.mock("@/lib/newapi/tokens", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
  revealTokenKey: (...args: unknown[]) => mockRevealTokenKey(...args),
}));

import {
  PlaygroundError,
  resolvePlaygroundKey,
} from "@/lib/newapi/playground";
import type { NewApiAuth } from "@/lib/newapi/types";

const auth: NewApiAuth = {
  accessToken: "newapi-access-token",
  userId: "99",
};

describe("resolvePlaygroundKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("returns 409 when reveal key fails", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "Playground Chat",
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
});
