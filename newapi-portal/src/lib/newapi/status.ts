import "server-only";

import { getNewApiConfig, newApiRequest } from "./client";

export interface NewApiStatus {
  version?: string;
  start_time?: number;
  system_name?: string;
  quota_per_unit?: number;
  display_in_currency?: boolean;
  quota_display_type?: string;
  usd_exchange_rate?: number;
  custom_currency_symbol?: string;
  custom_currency_exchange_rate?: number;
  setup?: boolean;
  [key: string]: unknown;
}

export async function fetchNewApiStatus(): Promise<NewApiStatus> {
  return newApiRequest<NewApiStatus>("/api/status", {
    cache: "no-store",
  });
}

export async function fetchNewApiStatusSafe(): Promise<NewApiStatus | null> {
  try {
    return await fetchNewApiStatus();
  } catch {
    return null;
  }
}

export function getNewApiStatusUrl(): string {
  const { baseUrl } = getNewApiConfig();
  return `${baseUrl}/api/status`;
}
