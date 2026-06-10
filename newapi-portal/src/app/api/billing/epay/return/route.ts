import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const env = getServerEnv();
  const target = new URL("/dashboard/billing?payment=return", env.APP_URL);
  return NextResponse.redirect(target, 302);
}
