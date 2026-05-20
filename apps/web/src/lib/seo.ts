const SITE_URL = process.env.SITE_URL ?? "https://stanza.tools";

const DEFAULT_TITLE = "stanza";
const DEFAULT_DESCRIPTION = "Modular monorepo template builder.";

export type HeadInput = {
  /** Page-specific title. Concatenated to the site name: `${title} · stanza`. */
  title?: string;
  description?: string;
  /** Path-only URL (e.g. `/m/auth/better-auth`). Used to build `og:url` + canonical. */
  path: string;
  /** OG image URL. Path-only ok — gets resolved against the site origin. */
  ogImage?: string;
  /** Defaults to `"website"`; module detail pages use `"article"`. */
  type?: "website" | "article";
};

export type HeadOutput = {
  meta: Array<Record<string, string>>;
  links: Array<Record<string, string>>;
};

export function buildHead(input: HeadInput): HeadOutput {
  const title = input.title ? `${input.title} · ${DEFAULT_TITLE}` : DEFAULT_TITLE;
  const description = input.description ?? DEFAULT_DESCRIPTION;
  const url = abs(input.path);
  const ogImage = abs(input.ogImage ?? "/og");
  const type = input.type ?? "website";

  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title },
      { name: "description", content: description },
      { property: "og:type", content: type },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: ogImage },
      { property: "og:site_name", content: DEFAULT_TITLE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: ogImage },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

function abs(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const base = SITE_URL.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export { SITE_URL };
