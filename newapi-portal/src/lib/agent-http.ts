export const agentDiscoveryLinkHeader = [
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</auth.md>; rel="service-doc"; type="text/markdown"',
  '</.well-known/api-catalog>; rel="service-desc"; type="application/linkset+json"',
  '</api/health>; rel="status"; type="application/json"',
  '</.well-known/mcp/server-card.json>; rel="mcp-server-card"; type="application/json"',
  '</.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"',
  '</.well-known/oauth-protected-resource>; rel="oauth-protected-resource"; type="application/json"',
].join(", ");

type AcceptEntry = {
  type: string;
  subtype: string;
  q: number;
  index: number;
};

const markdownNegotiationCandidates = [
  "application/linkset+json",
  "application/json",
  "text/html",
  "text/markdown",
] as const;

export function negotiateContentType(
  acceptHeader: string | null,
  candidates: readonly string[],
): string | null {
  if (candidates.length === 0) {
    return null;
  }

  const entries = parseAcceptHeader(acceptHeader);
  if (entries.length === 0) {
    return candidates[0] ?? null;
  }

  let best:
    | {
        candidate: string;
        q: number;
        specificity: number;
        entryIndex: number;
        candidateIndex: number;
      }
    | null = null;

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const [candidateType, candidateSubtype] = candidate.toLowerCase().split("/");

    if (!candidateType || !candidateSubtype) {
      continue;
    }

    for (const entry of entries) {
      const typeMatches = entry.type === "*" || entry.type === candidateType;
      const subtypeMatches = entry.subtype === "*" || entry.subtype === candidateSubtype;

      if (!typeMatches || !subtypeMatches) {
        continue;
      }

      const specificity =
        (entry.type === "*" ? 0 : 1) + (entry.subtype === "*" ? 0 : 1);
      const match = {
        candidate,
        q: entry.q,
        specificity,
        entryIndex: entry.index,
        candidateIndex,
      };

      if (!best || compareAcceptMatches(match, best) < 0) {
        best = match;
      }
    }
  }

  return best?.candidate ?? null;
}

export function wantsMarkdownFromAccept(acceptHeader: string | null): boolean {
  return (
    negotiateContentType(acceptHeader, markdownNegotiationCandidates) ===
    "text/markdown"
  );
}

export function wantsMarkdown(request: Pick<Request, "headers">): boolean {
  return wantsMarkdownFromAccept(request.headers.get("accept"));
}

function parseAcceptHeader(acceptHeader: string | null): AcceptEntry[] {
  if (!acceptHeader?.trim()) {
    return [];
  }

  return acceptHeader
    .split(",")
    .map((rawEntry, index): AcceptEntry | null => {
      const [rawMediaRange, ...rawParams] = rawEntry.split(";");
      const mediaRange = rawMediaRange?.trim().toLowerCase();
      const [type, subtype] = mediaRange?.split("/") ?? [];

      if (!type || !subtype) {
        return null;
      }

      const q = parseQuality(rawParams);

      if (q <= 0) {
        return null;
      }

      return { type, subtype, q, index };
    })
    .filter((entry): entry is AcceptEntry => Boolean(entry));
}

function parseQuality(rawParams: string[]): number {
  const qParam = rawParams.find((param) =>
    param.trim().toLowerCase().startsWith("q="),
  );

  if (!qParam) {
    return 1;
  }

  const value = Number.parseFloat(qParam.split("=")[1]?.trim() ?? "");

  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1);
}

function compareAcceptMatches(
  left: {
    q: number;
    specificity: number;
    entryIndex: number;
    candidateIndex: number;
  },
  right: {
    q: number;
    specificity: number;
    entryIndex: number;
    candidateIndex: number;
  },
): number {
  return (
    right.q - left.q ||
    right.specificity - left.specificity ||
    left.entryIndex - right.entryIndex ||
    left.candidateIndex - right.candidateIndex
  );
}
