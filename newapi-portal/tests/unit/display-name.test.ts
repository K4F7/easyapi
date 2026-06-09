import { describe, expect, it } from "vitest";

import {
  getUserContactEmail,
  getUserDisplayName,
  isPortalPlaceholderEmail,
} from "@/lib/auth/display-name";

describe("display-name", () => {
  it("treats @newapi.local addresses as portal placeholders", () => {
    expect(isPortalPlaceholderEmail("sein@newapi.local")).toBe(true);
    expect(isPortalPlaceholderEmail("scr@qq.com")).toBe(false);
  });

  it("prefers stored username over placeholder email", () => {
    expect(
      getUserDisplayName({
        username: "sein",
        email: "sein@newapi.local",
      }),
    ).toBe("sein");
  });

  it("hides placeholder emails from contact email", () => {
    expect(
      getUserContactEmail({
        username: "sein",
        email: "sein@newapi.local",
      }),
    ).toBeNull();

    expect(
      getUserContactEmail({
        username: "sein",
        email: "real@example.com",
      }),
    ).toBe("real@example.com");
  });
});
