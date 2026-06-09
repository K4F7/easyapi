import { describe, expect, it } from "vitest";

import { mockModels } from "@/lib/dev-mock/fixtures";

describe("dev mock model aliases", () => {
  it("includes gpt-latest and claude-latest for local playground verification", () => {
    const ids = mockModels.map((model) => model.id);

    expect(ids).toContain("gpt-latest");
    expect(ids).toContain("claude-latest");
  });
});
