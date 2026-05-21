import type { Logo } from "@stanza/registry";

import { cn } from "@/lib/utils";

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
        aria-hidden
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
    return <div aria-hidden className={wrapClass} dangerouslySetInnerHTML={{ __html: logo }} />;
  }

  return (
    <>
      <div
        aria-hidden
        className={cn(wrapClass, "dark:hidden")}
        dangerouslySetInnerHTML={{ __html: logo.light }}
      />
      <div
        aria-hidden
        className={cn(wrapClass, "hidden dark:flex")}
        dangerouslySetInnerHTML={{ __html: logo.dark }}
      />
    </>
  );
}
