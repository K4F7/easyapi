import type { Locator, Page } from "@playwright/test";

export type RouteMarker =
  | { heading: string; level?: 1; exact?: boolean; text?: never; role?: never }
  | { text: string; heading?: never; level?: never; role?: never }
  | {
      role: "tab";
      name: string;
      selected?: boolean;
      heading?: never;
      text?: never;
    };

export type PortalRoute = {
  slug: string;
  path: string;
  marker: RouteMarker;
  errorTexts?: (string | RegExp)[];
};

export const PUBLIC_ROUTES: readonly PortalRoute[] = [
  {
    slug: "home",
    path: "/",
    marker: { heading: "管令牌、看用量、随时充值", level: 1 },
  },
  { slug: "login", path: "/login", marker: { heading: "欢迎回来" } },
  { slug: "register", path: "/register", marker: { heading: "创建账户" } },
  { slug: "forgot-password", path: "/forgot-password", marker: { heading: "找回密码" } },
] as const;

export const AUTH_ROUTES: readonly PortalRoute[] = [
  {
    slug: "dashboard",
    path: "/dashboard",
    marker: { heading: "概览", level: 1 },
    errorTexts: ["概览加载失败"],
  },
  {
    slug: "dashboard-tokens",
    path: "/dashboard/tokens",
    marker: { heading: "令牌", level: 1 },
    errorTexts: ["Token 列表加载失败", "令牌加载失败"],
  },
  {
    slug: "dashboard-billing",
    path: "/dashboard/billing",
    marker: { text: "充值金额" },
  },
  {
    slug: "dashboard-usage",
    path: "/dashboard/usage",
    marker: { heading: "用量", exact: true },
    errorTexts: ["用量加载失败"],
  },
  {
    slug: "dashboard-playground",
    path: "/dashboard/playground",
    marker: { role: "tab", name: "对话", selected: true },
  },
  {
    slug: "dashboard-profile",
    path: "/dashboard/profile",
    marker: { heading: "个人资料" },
    errorTexts: [/Application error: a server-side exception has occurred/i],
  },
] as const;

/** Browsers may request /favicon.ico even when the app icon is duck.webp. */
export function isBenign404(url: string): boolean {
  try {
    return new URL(url).pathname === "/favicon.ico";
  } catch {
    return false;
  }
}

export function routeLocator(page: Page, marker: RouteMarker): Locator {
  if ("role" in marker && marker.role === "tab") {
    return page.getByRole("tab", {
      name: marker.name,
      selected: marker.selected,
    });
  }

  if ("text" in marker && marker.text) {
    return page.getByText(marker.text).first();
  }

  const headingMarker = marker as Extract<RouteMarker, { heading: string }>;
  const options: { level?: 1; name: string; exact?: boolean } = {
    name: headingMarker.heading,
  };
  if (headingMarker.level) {
    options.level = headingMarker.level;
  }
  if (headingMarker.exact) {
    options.exact = true;
  }
  return page.getByRole("heading", options);
}
