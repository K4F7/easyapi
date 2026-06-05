import { getAuthMarkdown, markdownResponse } from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export function GET() {
  return markdownResponse(getAuthMarkdown());
}
