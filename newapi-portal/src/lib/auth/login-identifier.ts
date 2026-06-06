/**
 * NewAPI password login accepts usernames, not email addresses.
 * Portal login forms accept either, so map email identifiers to likely usernames.
 */
export function resolveNewApiLoginUsernames(identifier: string): string[] {
  const normalized = identifier.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  if (!normalized.includes("@")) {
    return [normalized];
  }

  const localPart = normalized.split("@")[0] ?? "";
  const derivedUsername = localPart
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 32);

  const candidates = [derivedUsername, normalized].filter(Boolean);
  return [...new Set(candidates)];
}
