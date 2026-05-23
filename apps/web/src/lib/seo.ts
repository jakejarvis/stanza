const SITE_URL = process.env.SITE_URL ?? "https://stanza.tools";

const DEFAULT_TITLE = "stanza";
const DEFAULT_DESCRIPTION = "Modular monorepo template builder.";
const REPO_URL = "https://github.com/jakejarvis/stanza";

type JsonLdValue = string | number | boolean | null | JsonLdObject | readonly JsonLdValue[];

export type JsonLdObject = {
  [key: string]: JsonLdValue | undefined;
};

export type HeadInput = {
  /** Page-specific title. Concatenated to the site name: `${title} · stanza`. */
  title?: string;
  /** Full title that bypasses the ` · stanza` suffix. Use for the homepage. */
  titleOverride?: string;
  /** Page-specific description. */
  description?: string;
  /** Path-only URL (e.g. `/registry/auth/better-auth`). Used to build `og:url` + canonical. */
  path: string;
  /** OG image URL. Path-only ok — gets resolved against the site origin. */
  ogImage?: string;
  /** Defaults to `"website"`; module detail pages use `"article"`. */
  type?: "website" | "article";
  /** Path to a Markdown alternate of this page (e.g. `/docs/registry.md`). */
  markdownPath?: string;
  /** schema.org JSON-LD objects to emit as inline `<script type="application/ld+json">`. */
  jsonLd?: readonly JsonLdObject[];
};

export type HeadOutput = {
  meta: Array<Record<string, string>>;
  links: Array<Record<string, string>>;
  scripts: Array<{ type: "application/ld+json"; children: string }>;
};

export function buildHead(input: HeadInput): HeadOutput {
  const title =
    input.titleOverride ?? (input.title ? `${input.title} · ${DEFAULT_TITLE}` : DEFAULT_TITLE);
  const description = input.description ?? DEFAULT_DESCRIPTION;
  const url = abs(input.path);
  const ogImage = abs(input.ogImage ?? "/og");
  const type = input.type ?? "website";

  const links: Array<Record<string, string>> = [{ rel: "canonical", href: url }];

  if (input.markdownPath) {
    links.push({
      rel: "alternate",
      type: "text/markdown",
      href: abs(input.markdownPath),
      title: `${title} as Markdown`,
    });
  }

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
    links,
    scripts: (input.jsonLd ?? []).map((entry) => ({
      type: "application/ld+json",
      children: serializeJsonLd(entry),
    })),
  };
}

export function getWebSiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: DEFAULT_TITLE,
    url: abs("/"),
    description: DEFAULT_DESCRIPTION,
    publisher: {
      "@type": "Organization",
      name: DEFAULT_TITLE,
      url: abs("/"),
      sameAs: [REPO_URL],
    },
  };
}

export function getTechArticleJsonLd({
  title,
  description,
  path,
  section,
}: {
  title: string;
  description: string;
  path: string;
  section?: string;
}): JsonLdObject {
  const url = abs(path);
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    name: title,
    description: description.trim() || DEFAULT_DESCRIPTION,
    url,
    mainEntityOfPage: url,
    ...(section ? { articleSection: section } : {}),
    isPartOf: {
      "@type": "WebSite",
      name: DEFAULT_TITLE,
      url: abs("/"),
    },
  };
}

export function getSoftwareSourceCodeJsonLd({
  name,
  description,
  path,
  version,
  author,
  homepage,
}: {
  name: string;
  description: string;
  path: string;
  version?: string;
  author?: string;
  homepage?: string;
}): JsonLdObject {
  const url = abs(path);
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name,
    description: description.trim() || DEFAULT_DESCRIPTION,
    url,
    programmingLanguage: "TypeScript",
    ...(version ? { softwareVersion: version } : {}),
    ...(author ? { author: { "@type": "Person", name: author } } : {}),
    ...(homepage ? { sameAs: [homepage] } : {}),
    isPartOf: {
      "@type": "WebSite",
      name: DEFAULT_TITLE,
      url: abs("/"),
    },
  };
}

function serializeJsonLd(jsonLd: JsonLdObject): string {
  return JSON.stringify(jsonLd).replace(/</gu, "\\u003c");
}

function abs(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const base = SITE_URL.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export { SITE_URL };
