import type { ModuleSummary } from "@stanza/registry";
import { slotLabel } from "@stanza/registry";
import type { ReactElement } from "react";

/**
 * The visual layout shared by all OG images. Lives in `src/server/` so the
 * tsx/JSX parsing applies — Nitro server routes are plain .ts files.
 *
 * Satori (used inside @vercel/og) supports a subset of CSS — flex layout,
 * absolute positioning, basic typography. No grid, no shadows on text, etc.
 */
export function OgCard({ summary }: { summary: ModuleSummary }): ReactElement {
  const logo = summary.logo;
  // The OG card is always dark-background. For a theme pair, use the `dark`
  // variant (designed for dark surfaces); for a single theme-agnostic mark,
  // use it as-is. Either way we render it untouched — inverting mangles
  // colored brand marks (Tailwind blue→orange, Clerk purple→lime, etc).
  const logoSrc = typeof logo === "string" ? logo : (logo?.dark ?? logo?.light);
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0a",
        color: "#fafafa",
        padding: "80px",
        fontFamily: "Inter, system-ui",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "28px", fontWeight: 600, letterSpacing: "-0.02em" }}>stanza</span>
        <span style={{ color: "#52525b", fontSize: "20px" }}>·</span>
        <span style={{ color: "#a1a1aa", fontSize: "20px" }}>{slotLabel(summary.slot)}</span>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          {logoSrc ? (
            <div
              style={{
                width: "96px",
                height: "96px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#18181b",
                borderRadius: "16px",
                padding: "16px",
              }}
            >
              {/* Satori renders <img> with `src` set to a data URI for SVGs */}
              <img src={svgToDataUri(logoSrc)} width={64} height={64} alt="" />
            </div>
          ) : (
            <div
              style={{
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
              }}
            >
              {summary.label.slice(0, 1)}
            </div>
          )}
          <div
            style={{ fontSize: "72px", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}
          >
            {summary.label}
          </div>
        </div>
        <div
          style={{
            fontSize: "28px",
            color: "#a1a1aa",
            lineHeight: 1.3,
            maxWidth: "900px",
          }}
        >
          {summary.description}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "#52525b",
          fontSize: "20px",
        }}
      >
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
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0a",
        color: "#fafafa",
        padding: "80px",
        fontFamily: "Inter, system-ui",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "24px",
        }}
      >
        <div
          style={{ fontSize: "120px", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}
        >
          stanza
        </div>
        <div style={{ fontSize: "36px", color: "#a1a1aa", lineHeight: 1.3, maxWidth: "900px" }}>
          Modular monorepo template builder.
        </div>
      </div>
      <div style={{ color: "#52525b", fontSize: "22px" }}>pnpm create stanza my-app</div>
    </div>
  );
}

function svgToDataUri(svg: string): string {
  // Encode SVG → data URI. Satori's `<img>` accepts data: URIs for SVG.
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}
