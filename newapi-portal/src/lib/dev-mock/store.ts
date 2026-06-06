import "server-only";

import type { PublicUser } from "@/lib/auth";
import type { NewApiToken } from "@/lib/newapi";
import { dateKey, todayDateOnly } from "@/lib/quota/usage";

type MockOrder = {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  productCode: string | null;
  quotaAmount: number | null;
  provider: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type MockState = {
  sessionToken: string;
  user: PublicUser;
  tokens: NewApiToken[];
  orders: MockOrder[];
  quota: number;
  usedQuota: number;
  checkedInOn: string | null;
  redeemedCodes: Map<string, { ledgerId: string; amount: number; createdAt: string }>;
  nextTokenId: number;
  nextOrderId: number;
};

const globalForMock = globalThis as unknown as {
  portalDevMockState?: MockState;
};

function createInitialState(): MockState {
  return {
    sessionToken: "portal-dev-mock-session",
    user: {
      id: "dev-mock-user",
      email: "scr@qq.com",
      inviteCode: "DEVMOCK",
      newApiUserId: "10001",
      newApiBinding: "ready",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
    tokens: [
      {
        id: 101,
        name: "Playground",
        key: "sk-dev-mock-playground",
        status: 1,
        created_time: 1_717_200_000,
        remain_quota: 500_000,
        used_quota: 17_200,
        unlimited_quota: false,
        group: "default",
      },
      {
        id: 102,
        name: "Frontend Dev",
        key: "sk-dev-mock-frontend",
        status: 1,
        created_time: 1_717_250_000,
        remain_quota: 250_000,
        used_quota: 5_200,
        unlimited_quota: false,
        group: "default",
      },
    ],
    orders: [],
    quota: 500_000,
    usedQuota: 17_200,
    checkedInOn: null,
    redeemedCodes: new Map(),
    nextTokenId: 200,
    nextOrderId: 300,
  };
}

export function getMockState(): MockState {
  globalForMock.portalDevMockState ??= createInitialState();
  return globalForMock.portalDevMockState;
}

export function resetMockState(): void {
  globalForMock.portalDevMockState = createInitialState();
}

export function getMockUser(): PublicUser {
  return getMockState().user;
}

export function getMockSessionToken(): string {
  return getMockState().sessionToken;
}

export function createMockToken(input: {
  name: string;
  expired_time?: number;
  remain_quota?: number;
  unlimited_quota?: boolean;
  model_limits_enabled?: boolean;
  model_limits?: string;
  allow_ips?: string | null;
  group?: string;
  cross_group_retry?: boolean;
}) {
  const state = getMockState();
  const token: NewApiToken = {
    id: state.nextTokenId++,
    name: input.name,
    key: `sk-dev-mock-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
    status: 1,
    created_time: Math.floor(Date.now() / 1000),
    expired_time: input.expired_time,
    remain_quota: input.remain_quota ?? 100_000,
    used_quota: 0,
    unlimited_quota: input.unlimited_quota ?? false,
    model_limits_enabled: input.model_limits_enabled,
    model_limits: input.model_limits,
    allow_ips: input.allow_ips,
    group: input.group ?? "default",
    cross_group_retry: input.cross_group_retry,
  };
  state.tokens.unshift(token);
  return token;
}

export function deleteMockToken(id: string | number): boolean {
  const state = getMockState();
  const numericId = Number(id);
  const before = state.tokens.length;
  state.tokens = state.tokens.filter((token) => token.id !== numericId);
  return state.tokens.length !== before;
}

export function listMockTokens(page: number, pageSize: number) {
  const state = getMockState();
  const start = (page - 1) * pageSize;
  return {
    items: state.tokens.slice(start, start + pageSize),
    total: state.tokens.length,
    page,
    page_size: pageSize,
  };
}

export function checkInMockUser() {
  const state = getMockState();
  const checkedInOn = dateKey(todayDateOnly());
  const alreadyCheckedIn = state.checkedInOn === checkedInOn;
  state.checkedInOn = checkedInOn;
  const quotaAmount = alreadyCheckedIn ? 0 : 1000;

  if (quotaAmount > 0) {
    state.quota += quotaAmount;
  }

  return {
    checkedIn: true,
    alreadyCheckedIn,
    checkedInOn,
    quotaAmount,
    quotaApplied: true,
    checkinId: `mock-checkin-${checkedInOn}`,
    ledgerId: `mock-ledger-checkin-${checkedInOn}`,
  };
}

export function redeemMockCode(code: string) {
  const state = getMockState();
  const normalized = code.trim().toUpperCase();
  const existing = state.redeemedCodes.get(normalized);

  if (existing) {
    return {
      redeemed: true,
      duplicate: true,
      quotaAmount: existing.amount,
      ledger: {
        id: existing.ledgerId,
        amount: existing.amount,
        createdAt: existing.createdAt,
      },
      upstream: { mock: true, code: normalized },
    };
  }

  const createdAt = new Date().toISOString();
  const amount = 20_000;
  const ledgerId = `mock-ledger-redeem-${state.redeemedCodes.size + 1}`;
  state.redeemedCodes.set(normalized, { ledgerId, amount, createdAt });
  state.quota += amount;

  return {
    redeemed: true,
    duplicate: false,
    quotaAmount: amount,
    ledger: { id: ledgerId, amount, createdAt },
    upstream: { mock: true, code: normalized },
  };
}

export function createMockOrder(input: {
  amountCents: number;
  productCode?: string;
}) {
  const state = getMockState();
  const order: MockOrder = {
    id: `mock-order-${state.nextOrderId++}`,
    status: "PENDING",
    amountCents: input.amountCents,
    currency: "CNY",
    productCode: input.productCode ?? "quota",
    quotaAmount: null,
    provider: "dev-mock:epay",
    paidAt: null,
    expiresAt: null,
    createdAt: new Date().toISOString(),
  };
  state.orders.unshift(order);
  return order;
}
