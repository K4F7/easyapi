import { describe, expect, it } from "vitest";

import {
  hashNoticeContent,
  parseNoticePayload,
} from "@/lib/newapi/notice";

describe("newapi notice", () => {
  it("parses markdown strings from the notice payload", () => {
    expect(parseNoticePayload("# 系统公告\n\n欢迎使用")).toEqual({
      content: "# 系统公告\n\n欢迎使用",
      contentHash: hashNoticeContent("# 系统公告\n\n欢迎使用"),
    });
  });

  it("parses wrapped notice objects", () => {
    expect(parseNoticePayload({ content: "  维护通知  " })).toEqual({
      content: "维护通知",
      contentHash: hashNoticeContent("维护通知"),
    });
  });

  it("returns null for empty notice content", () => {
    expect(parseNoticePayload("")).toBeNull();
    expect(parseNoticePayload("   ")).toBeNull();
    expect(parseNoticePayload({ content: "" })).toBeNull();
  });
});
