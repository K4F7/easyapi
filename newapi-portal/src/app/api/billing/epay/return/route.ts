import { jsonOk } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk({
    payment: {
      returned: true,
      message: "Payment status is handled by NewAPI. Return to billing to refresh your balance and order history.",
    },
  });
}
