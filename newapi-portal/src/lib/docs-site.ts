export const DOCS_PLACEHOLDER_PATH = "/dashboard/docs";

export type DocsNavConfig = {
  href: string;
  external: boolean;
  badge?: string;
};

export function getDocsNavConfig(): DocsNavConfig {
  const externalUrl = process.env.NEXT_PUBLIC_DOCS_URL?.trim();

  if (externalUrl) {
    return {
      href: externalUrl,
      external: true,
    };
  }

  return {
    href: DOCS_PLACEHOLDER_PATH,
    external: false,
    badge: "WIP",
  };
}
