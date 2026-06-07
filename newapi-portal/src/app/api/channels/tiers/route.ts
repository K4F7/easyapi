import { jsonOk } from "@/lib/auth";
import { channelTiers, defaultChannelGroup } from "@/lib/channels/tiers";

export const runtime = "nodejs";

export function GET() {
  return jsonOk({
    tiers: channelTiers,
    defaultGroup: defaultChannelGroup,
  });
}
