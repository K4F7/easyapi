import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "newapi-portal",
    timestamp: new Date().toISOString(),
  });
}
