import { jsonOk } from "@/lib/auth";
import { isDevMockEnabled, mockImageEmbedConfigResponse } from "@/lib/dev-mock";
import { isImagePlaygroundProxyConfigured } from "@/lib/playground/image-playground-proxy";

export const runtime = "nodejs";

export async function GET() {
  if (isDevMockEnabled()) {
    return mockImageEmbedConfigResponse();
  }

  return jsonOk({
    configured: isImagePlaygroundProxyConfigured(),
  });
}
