import type { Logo } from "@withstanza/schema";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

function InlineSvg({ html, className }: { html: string; className: string }) {
  const inner = useMemo(() => ({ __html: html }), [html]);
  return <div aria-hidden="true" className={className} dangerouslySetInnerHTML={inner} />;
}

/**
 * Renders an inline-SVG module logo, falling back to a single-letter tile.
 * Used by the slot cards, header search results, and the module detail page.
 * Logos come from our trusted first-party registry payload.
 */
export function ModuleLogo({
  logo,
  label,
  size = "md",
}: {
  logo: Logo | undefined;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg"
      ? "size-12 [&_svg]:size-9 [&_svg]:max-h-9 [&_svg]:max-w-9"
      : size === "sm"
        ? "size-6 [&_svg]:size-4 [&_svg]:max-h-4 [&_svg]:max-w-4"
        : "size-9 [&_svg]:size-7 [&_svg]:max-h-7 [&_svg]:max-w-7";
  const textSize = size === "lg" ? "text-base" : size === "sm" ? "text-[10px]" : "text-xs";

  if (!logo) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-none border border-border bg-muted/40 font-semibold text-muted-foreground",
          sizeClass,
          textSize,
        )}
      >
        {label.slice(0, 1)}
      </div>
    );
  }

  const wrapClass = cn("flex shrink-0 items-center justify-center", sizeClass);

  if (typeof logo === "string") {
    return <InlineSvg html={logo} className={wrapClass} />;
  }

  return (
    <>
      <InlineSvg html={logo.light} className={cn(wrapClass, "dark:hidden")} />
      <InlineSvg html={logo.dark} className={cn(wrapClass, "hidden dark:flex")} />
    </>
  );
}
