import type { TemplateRef } from "@withstanza/schema";
import { useMemo, useState } from "react";

import { Section, SectionList } from "@/components/detail/section";
import { useTheme } from "@/components/theme-provider";
import type { Preview } from "@/server/highlighter";

/**
 * Lists the templates an adapter ships, with click-to-expand Shiki previews.
 * Previews are pre-rendered server-side and keyed by `dest`.
 */
export function TemplatesList({
  templates,
  previews,
}: {
  templates: TemplateRef[];
  previews: Record<string, Preview>;
}) {
  if (templates.length === 0) return null;
  const sorted = templates.toSorted(
    (a, b) => scopeRank(a.scope) - scopeRank(b.scope) || a.dest.localeCompare(b.dest),
  );
  return (
    <Section title="Templates" count={templates.length}>
      <SectionList>
        {sorted.map((tpl) => (
          <TemplateRow key={tpl.dest} template={tpl} preview={previews[tpl.dest]} />
        ))}
      </SectionList>
    </Section>
  );
}

function TemplateRow({
  template,
  preview,
}: {
  template: TemplateRef;
  preview: Preview | undefined;
}) {
  const [open, setOpen] = useState(false);
  const hasPreview = Boolean(preview);
  const previewId = `template-preview-${template.dest.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <li>
      <button
        type="button"
        onClick={() => hasPreview && setOpen((o) => !o)}
        disabled={!hasPreview}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-mono text-xs transition-colors hover:bg-muted/40 disabled:cursor-default disabled:text-foreground/70 disabled:hover:bg-transparent"
        aria-expanded={hasPreview ? open : undefined}
        aria-controls={hasPreview ? previewId : undefined}
      >
        <span className="truncate text-foreground">{template.dest}</span>
        <span className="shrink-0 text-[10px] tracking-wider text-muted-foreground/60 uppercase">
          {scopeLabel(template.scope)}
        </span>
      </button>
      {open && preview && <PreviewBlock id={previewId} dest={template.dest} preview={preview} />}
    </li>
  );
}

function PreviewBlock({ id, dest, preview }: { id: string; dest: string; preview: Preview }) {
  const { resolvedTheme } = useTheme();
  const inner = useMemo(
    () => ({ __html: resolvedTheme === "dark" ? preview.dark : preview.light }),
    [preview, resolvedTheme],
  );
  return (
    <div
      id={id}
      role="region"
      aria-label={`Preview of ${dest}`}
      className="overflow-auto border-t border-border pt-4 text-xs leading-relaxed [&_pre]:bg-transparent! [&_pre]:p-0!"
      dangerouslySetInnerHTML={inner}
    />
  );
}

function scopeLabel(scope: TemplateRef["scope"]): string {
  if (scope === "repo") return "repo";
  if (scope === "package") return "package";
  return "app";
}

function scopeRank(scope: TemplateRef["scope"]): number {
  if (scope === "package") return 1;
  if (scope === "app") return 2;
  return 0; // repo (or undefined default)
}
