import "server-only";

import { DEFAULT_QUOTA_DISPLAY_CONFIG } from "@/lib/quota/display-config.shared";
import {
  nowTimestamp,
  startOfTodayTimestamp,
  startOfWeekTimestamp,
} from "@/lib/quota/usage";

export const mockQuotaConfig = {
  ...DEFAULT_QUOTA_DISPLAY_CONFIG,
  quotaPerCny: 71_428.5,
  source: "default" as const,
};

export const mockModels = [
  { id: "gpt-4o-mini" },
  { id: "gpt-4.1-mini" },
  { id: "o3-mini" },
  { id: "claude-sonnet-4-20250514" },
  { id: "deepseek-chat" },
];

export function mockUsageItems() {
  const today = startOfTodayTimestamp();
  return [
    {
      id: 1,
      model_name: "gpt-4o-mini",
      created_at: today + 9 * 3600,
      token_used: 1420,
      count: 8,
      quota: 12000,
    },
    {
      id: 2,
      model_name: "deepseek-chat",
      created_at: today + 13 * 3600,
      token_used: 860,
      count: 5,
      quota: 5200,
    },
  ];
}

export function mockUsageResponse() {
  const items = mockUsageItems();
  return {
    items,
    totals: { quota: 17200, count: 13, tokenUsed: 2280 },
    query: {
      start_timestamp: startOfWeekTimestamp(),
      end_timestamp: nowTimestamp(),
      default_time: "day",
    },
  };
}

export function mockLogs() {
  const now = nowTimestamp();
  return [
    {
      id: 9003,
      created_at: now - 300,
      token_name: "Playground",
      model_name: "gpt-4o-mini",
      quota: 7200,
      prompt_tokens: 640,
      completion_tokens: 220,
      use_time: 880,
      group: "normal",
      request_id: "mock-req-chat-003",
    },
    {
      id: 9002,
      created_at: now - 1800,
      token_name: "Frontend Dev",
      model_name: "deepseek-chat",
      quota: 5200,
      prompt_tokens: 420,
      completion_tokens: 180,
      use_time: 640,
      group: "normal",
      request_id: "mock-req-chat-002",
    },
    {
      id: 9001,
      created_at: now - 3600,
      token_name: "Playground",
      model_name: "gpt-image-1",
      quota: 4800,
      prompt_tokens: 120,
      completion_tokens: 0,
      use_time: 1420,
      group: "normal",
      request_id: "mock-req-image-001",
    },
  ];
}
