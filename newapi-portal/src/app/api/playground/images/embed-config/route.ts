import { jsonOk } from "@/lib/auth";
import { isImagePlaygroundProxyConfigured } from "@/lib/playground/image-playground-proxy";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk({
    configured: isImagePlaygroundProxyConfigured(),
  });
}
