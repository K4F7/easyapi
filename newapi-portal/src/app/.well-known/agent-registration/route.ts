import {
  getAgentRegistrationMetadata,
  getAuthMarkdown,
  jsonResponse,
  markdownResponse,
  wantsMarkdown,
} from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  if (wantsMarkdown(request)) {
    return markdownResponse(getAuthMarkdown());
  }

  return jsonResponse(getAgentRegistrationMetadata());
}
