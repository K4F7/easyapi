import {
  discoverySkillMarkdown,
  markdownResponse,
} from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ skill: string }> },
) {
  const { skill } = await params;

  if (skill !== "discovery") {
    return markdownResponse("# Skill Not Found\n", { status: 404 });
  }

  return markdownResponse(discoverySkillMarkdown);
}
