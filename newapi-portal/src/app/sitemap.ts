import type { MetadataRoute } from "next";

import { absoluteUrl, getSitemapPaths } from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return getSitemapPaths().map((path) => ({
    url: absoluteUrl(path),
    lastModified: new Date("2026-06-05T00:00:00.000Z"),
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
