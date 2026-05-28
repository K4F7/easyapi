import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return notifyMoved();
}

export async function POST() {
  return notifyMoved();
}

function notifyMoved(): NextResponse {
  return NextResponse.json(
    {
      code: "EPAY_NOTIFY_HANDLED_BY_NEWAPI",
      message: "EPay notify belongs to NewAPI. Configure the gateway callback to /api/user/epay/notify on the NewAPI public URL.",
    },
    { status: 410 },
  );
}
