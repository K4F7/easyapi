import {
  absoluteUrl,
  discoverySkillMarkdown,
  jsonResponse,
  sha256Hex,
} from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse({
    $schema: "https://schemas.agentcommunity.org/skills-index/v1.json",
    skills: [
      {
        name: "ezapi-discovery",
        type: "read-only-discovery",
        description: "Discover public EZAPI Portal metadata, auth documentation, and DNS-AID setup notes.",
        url: absoluteUrl("/.well-known/agent-skills/discovery/SKILL.md"),
        sha256: sha256Hex(discoverySkillMarkdown),
      },
    ],
  });
}
