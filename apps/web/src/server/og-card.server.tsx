import type { ModuleSummary } from "@stanza/registry";
import { slotLabel } from "@stanza/registry";
import type { CSSProperties, ReactElement } from "react";

/**
 * The visual layout shared by all OG images. Lives in `src/server/` so the
 * tsx/JSX parsing applies — Nitro server routes are plain .ts files.
 *
 * Satori (used inside @vercel/og) supports a subset of CSS — flex layout,
 * absolute positioning, basic typography. No grid, no shadows on text, etc.
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
  fontFamily: "Inter, system-ui",
};

const HEADER_ROW: CSSProperties = { display: "flex", alignItems: "center", gap: "12px" };
const WORDMARK: CSSProperties = { fontSize: "28px", fontWeight: 600, letterSpacing: "-0.02em" };
const DOT: CSSProperties = { color: "#52525b", fontSize: "20px" };
const SLOT: CSSProperties = { color: "#a1a1aa", fontSize: "20px" };

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
  color: "#52525b",
  fontSize: "20px",
};

const DEFAULT_BODY: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "24px",
};
const BIG_WORDMARK: CSSProperties = {
  fontSize: "120px",
  fontWeight: 700,
  letterSpacing: "-0.04em",
  lineHeight: 1,
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
        <span style={WORDMARK}>stanza</span>
        <span style={DOT}>·</span>
        <span style={SLOT}>{slotLabel(summary.slot)}</span>
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
          {summary.slot}/{summary.id}
        </span>
        <span>v{summary.version}</span>
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
        <div style={BIG_WORDMARK}>stanza</div>
        <div style={TAGLINE}>Modular monorepo template builder.</div>
      </div>
      <div style={DEFAULT_FOOTER}>pnpm create stanza my-app</div>
    </div>
  );
}

function svgToDataUri(svg: string): string {
  // Encode SVG → data URI. Satori's `<img>` accepts data: URIs for SVG.
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}
