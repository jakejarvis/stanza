import type { TemplateRef } from "@stanza/registry";
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
  return (
    <Section title="Templates">
      <SectionList>
        {templates.map((tpl) => (
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
  return (
    <li>
      <button
        type="button"
        onClick={() => hasPreview && setOpen((o) => !o)}
        disabled={!hasPreview}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-mono text-xs transition-colors hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
        aria-expanded={open}
      >
        <span className="truncate text-foreground">{template.dest}</span>
        <span className="shrink-0 text-[10px] tracking-wider text-muted-foreground/60 uppercase">
          {scopeLabel(template.scope)}
        </span>
      </button>
      {open && preview && <PreviewBlock preview={preview} />}
    </li>
  );
}

function PreviewBlock({ preview }: { preview: Preview }) {
  const { resolvedTheme } = useTheme();
  const inner = useMemo(
    () => ({ __html: resolvedTheme === "dark" ? preview.dark : preview.light }),
    [preview, resolvedTheme],
  );
  return (
    <div
      className="overflow-auto border-t border-border text-xs leading-relaxed [&_pre]:bg-transparent! [&_pre]:p-4!"
      dangerouslySetInnerHTML={inner}
    />
  );
}

function scopeLabel(scope: TemplateRef["scope"]): string {
  if (scope === "repo") return "repo";
  if (scope === "package") return "package";
  return "app";
}
