import { describe, expect, it } from "vitest";

import { resolveNewApiLoginUsernames } from "@/lib/auth/login-identifier";

describe("resolveNewApiLoginUsernames", () => {
  it("returns the username unchanged when no email is provided", () => {
    expect(resolveNewApiLoginUsernames("scr")).toEqual(["scr"]);
  });

  it("derives a username from the email local part before the raw email", () => {
    expect(resolveNewApiLoginUsernames("scr@qq.com")).toEqual([
      "scr",
      "scr@qq.com",
    ]);
  });

  it("sanitizes unsupported characters in the email local part", () => {
    expect(resolveNewApiLoginUsernames("john.doe@example.com")).toEqual([
      "john-doe",
      "john.doe@example.com",
    ]);
  });

  it("normalizes casing and trims whitespace", () => {
    expect(resolveNewApiLoginUsernames("  SCR@QQ.com ")).toEqual([
      "scr",
      "scr@qq.com",
    ]);
  });
});
