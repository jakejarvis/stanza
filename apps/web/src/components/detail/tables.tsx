import type { EnvVar } from "@stanza/registry";

import { Section, SectionList } from "@/components/detail/section";
import { Badge } from "@/components/ui/badge";

export function DepsTable({ title, entries }: { title: string; entries: Record<string, string> }) {
  const items = Object.entries(entries);
  if (items.length === 0) return null;

  return (
    <Section title={title} count={items.length}>
      <SectionList>
        {items.map(([name, version]) => (
          <li key={name} translate="no">
            <a
              href={`https://npmx.dev/package/${name}/v/${version}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs transition-colors hover:bg-muted/50"
            >
              <span className="truncate text-foreground group-hover:underline group-hover:underline-offset-1">
                {name}
              </span>
              <span className="shrink-0 text-muted-foreground">{version}</span>
            </a>
          </li>
        ))}
      </SectionList>
    </Section>
  );
}

export function ScriptsTable({ entries }: { entries: Record<string, string> }) {
  const items = Object.entries(entries);
  if (items.length === 0) return null;

  return (
    <Section title="Scripts" count={items.length}>
      <SectionList>
        {items.map(([name, command]) => (
          <li
            key={name}
            translate="no"
            className="flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs"
          >
            <span className="truncate text-foreground">{name}</span>
            <span className="shrink-0 text-muted-foreground">{command}</span>
          </li>
        ))}
      </SectionList>
    </Section>
  );
}

export function EnvTable({ env }: { env: EnvVar[] }) {
  if (env.length === 0) return null;

  return (
    <Section title="Environment variables" count={env.length}>
      <SectionList>
        {env.map((e) => (
          <li key={e.name} className="grid gap-1 px-3 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-medium text-foreground">{e.name}</span>
              <Badge variant={e.required ? "default" : "outline"}>
                {e.required ? "required" : "optional"}
              </Badge>
              <span className="font-mono text-muted-foreground/70">= {e.example}</span>
            </div>
            {e.description && <p className="text-muted-foreground/80">{e.description}</p>}
          </li>
        ))}
      </SectionList>
    </Section>
  );
}
