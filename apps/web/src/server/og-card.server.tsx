import type { ModuleSummary } from "@stanza/registry";
import { categoryLabel } from "@stanza/registry";
import type { CSSProperties, ReactElement } from "react";

/**
 * The visual layout shared by all OG images. Lives in `src/server/` so the
 * tsx/JSX parsing applies — Nitro server routes are plain .ts files.
 *
 * Rendered by Takumi (@takumi-rs/image-response). Geist + Geist Mono are
 * pre-bundled by the renderer, so naming `Geist` here resolves to the same
 * typeface the live site loads via `@fontsource-variable/geist`.
 *
 * Styles are hoisted to module constants: these functions render once per
 * image (not React components that re-render), and static style objects must
 * not be allocated inline per react-perf.
 */
const PAGE: CSSProperties = {
  height: "100%",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  background: "#0a0a0a",
  color: "#fafafa",
  padding: "80px",
  fontFamily: "Geist, sans-serif",
};

const HEADER_ROW: CSSProperties = { display: "flex", alignItems: "center", gap: "12px" };
const DOT: CSSProperties = { color: "#52525b", fontSize: "20px" };
const SLOT: CSSProperties = { color: "#a1a1aa", fontSize: "20px" };

// Brand mark sized and colored for the always-dark OG background. The viewer
// `<img>` sets the rendered dimensions; the explicit fill keeps it visible
// without relying on currentColor (which Satori doesn't propagate to images).
const BRAND_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fafafa"><path d="M10.975 3.002a1 1 0 0 1-.754 1.196a8 8 0 1 0 8.446 3.379a1 1 0 1 1 1.666-1.107A9.96 9.96 0 0 1 22 12c0 5.523-4.477 10-10 10S2 17.523 2 12c0-4.76 3.325-8.742 7.779-9.752a1 1 0 0 1 1.196.754M13 3.014a1.01 1.01 0 0 1 1.214-.99l.115.031l2.987.996a1 1 0 0 1-.52 1.928l-.112-.03L15 4.387V12a3 3 0 1 1-2.19-2.89l.19.06V3.015Z"/></svg>`;

const BODY: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "20px",
};

const LOGO_ROW: CSSProperties = { display: "flex", alignItems: "center", gap: "28px" };

const LOGO_BOX: CSSProperties = {
  width: "96px",
  height: "96px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#18181b",
  borderRadius: "16px",
  padding: "16px",
};

const LETTER_BOX: CSSProperties = {
  width: "96px",
  height: "96px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#18181b",
  borderRadius: "16px",
  fontSize: "48px",
  fontWeight: 700,
  color: "#fafafa",
};

const TITLE: CSSProperties = {
  fontSize: "72px",
  fontWeight: 600,
  letterSpacing: "-0.03em",
  lineHeight: 1,
};
const DESCRIPTION: CSSProperties = {
  fontSize: "28px",
  color: "#a1a1aa",
  lineHeight: 1.3,
  maxWidth: "900px",
};
const FOOTER: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  color: "#6c6c6c",
  fontSize: "20px",
};

const DEFAULT_BODY: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "24px",
};
const TAGLINE: CSSProperties = {
  fontSize: "36px",
  color: "#a1a1aa",
  lineHeight: 1.3,
  maxWidth: "900px",
};
const DEFAULT_FOOTER: CSSProperties = { color: "#52525b", fontSize: "22px" };

export function OgCard({ summary }: { summary: ModuleSummary }): ReactElement {
  const logo = summary.logo;
  // The OG card is always dark-background. For a theme pair, use the `dark`
  // variant (designed for dark surfaces); for a single theme-agnostic mark,
  // use it as-is. Either way we render it untouched — inverting mangles
  // colored brand marks (Tailwind blue→orange, Clerk purple→lime, etc).
  const logoSrc = typeof logo === "string" ? logo : (logo?.dark ?? logo?.light);
  return (
    <div style={PAGE}>
      <div style={HEADER_ROW}>
        <img src={svgToDataUri(BRAND_LOGO_SVG)} width={32} height={32} alt="stanza" />
        <span style={DOT}>·</span>
        <span style={SLOT}>{categoryLabel(summary.category)}</span>
      </div>

      <div style={BODY}>
        <div style={LOGO_ROW}>
          {logoSrc ? (
            <div style={LOGO_BOX}>
              {/* Satori renders <img> with `src` set to a data URI for SVGs */}
              <img src={svgToDataUri(logoSrc)} width={64} height={64} alt="" />
            </div>
          ) : (
            <div style={LETTER_BOX}>{summary.label.slice(0, 1)}</div>
          )}
          <div style={TITLE}>{summary.label}</div>
        </div>
        <div style={DESCRIPTION}>{summary.description}</div>
      </div>

      <div style={FOOTER}>
        <span>
          stanza.tools/m/{summary.category}/{summary.id}
        </span>
      </div>
    </div>
  );
}

/**
 * Per-docs-page OG. Mirrors `OgCard`'s chrome (brand + section label header,
 * footer slug) but swaps the body for a plain title + description block —
 * docs pages don't have a logo or version to display.
 */
export function OgDocs({
  title,
  description,
  slug,
}: {
  title: string;
  description: string;
  slug: string;
}): ReactElement {
  return (
    <div style={PAGE}>
      <div style={HEADER_ROW}>
        <img src={svgToDataUri(BRAND_LOGO_SVG)} width={32} height={32} alt="stanza" />
        <span style={DOT}>·</span>
        <span style={SLOT}>Docs</span>
      </div>

      <div style={BODY}>
        <div style={TITLE}>{title}</div>
        {description ? <div style={DESCRIPTION}>{description}</div> : null}
      </div>

      <div style={FOOTER}>
        <span>stanza.tools/docs/{slug}</span>
      </div>
    </div>
  );
}

/**
 * Default OG used by the home / search routes. Big wordmark + tagline.
 */
export function OgDefault(): ReactElement {
  return (
    <div style={PAGE}>
      <div style={DEFAULT_BODY}>
        <img src={svgToDataUri(BRAND_LOGO_SVG)} width={160} height={160} alt="stanza" />
        <div style={TAGLINE}>Modular monorepo template builder.</div>
      </div>
      <div style={DEFAULT_FOOTER}>npm init stanza my-app</div>
    </div>
  );
}

function svgToDataUri(svg: string): string {
  // Encode SVG → data URI. Satori's `<img>` accepts data: URIs for SVG.
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}
