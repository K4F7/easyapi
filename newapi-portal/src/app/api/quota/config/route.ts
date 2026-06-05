import { handleApiError } from "@/lib/api/bff";
import { jsonOk } from "@/lib/auth";
import { isDevMockEnabled, mockQuotaConfigResponse } from "@/lib/dev-mock";
import {
  getQuotaDisplayConfig,
  quotaDisplayConfigForClient,
} from "@/lib/quota/get-display-config";

export const runtime = "nodejs";

export async function GET() {
  if (isDevMockEnabled()) {
    return mockQuotaConfigResponse();
  }

  try {
    const config = await getQuotaDisplayConfig();
    return jsonOk({ config: quotaDisplayConfigForClient(config) });
  } catch (error) {
    return handleApiError(error, "Failed to load quota config");
  }
}
