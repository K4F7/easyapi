import "server-only";

export function isDevMockRequested(): boolean {
  return process.env.PORTAL_DEV_MOCK === "1";
}

export function assertDevMockAllowed(): void {
  if (isDevMockRequested() && process.env.NODE_ENV === "production") {
    throw new Error(
      "PORTAL_DEV_MOCK=1 is only allowed outside production.",
    );
  }
}

export function isDevMockEnabled(): boolean {
  assertDevMockAllowed();
  return isDevMockRequested();
}
