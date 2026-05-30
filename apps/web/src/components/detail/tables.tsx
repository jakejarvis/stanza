import { IconExternalLink } from "@tabler/icons-react";
import type { EnvVar } from "@withstanza/schema";

import { Section, SectionList } from "@/components/detail/section";
import { Badge } from "@/components/ui/badge";

export function DepsTable({ title, entries }: { title: string; entries: Record<string, string> }) {
  const items = Object.entries(entries).toSorted(([a], [b]) => a.localeCompare(b));
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
              aria-label={`${name} ${version} (opens in new tab)`}
              className="group flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0 truncate text-foreground group-hover:underline group-hover:underline-offset-1">
                {name}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1">
                <span className="text-muted-foreground tabular-nums group-hover:hidden">
                  {version}
                </span>
                <IconExternalLink
                  className="hidden size-3 shrink-0 text-muted-foreground/60 group-hover:block"
                  aria-hidden="true"
                />
              </span>
            </a>
          </li>
        ))}
      </SectionList>
    </Section>
  );
}

export function ScriptsTable({ entries }: { entries: Record<string, string> }) {
  const items = Object.entries(entries).toSorted(([a], [b]) => a.localeCompare(b));
  if (items.length === 0) return null;

  return (
    <Section title="Scripts" count={items.length}>
      <SectionList>
        {items.map(([name, command]) => (
          <li
            key={name}
            translate="no"
            className="flex items-start justify-between gap-3 px-3 py-2 font-mono text-xs"
          >
            <span className="shrink-0 text-foreground">{name}</span>
            <span className="min-w-0 text-right break-words whitespace-pre-wrap text-muted-foreground">
              {command}
            </span>
          </li>
        ))}
      </SectionList>
    </Section>
  );
}

export function EnvTable({ env }: { env: EnvVar[] }) {
  if (env.length === 0) return null;

  const items = env.toSorted(
    (a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name),
  );

  return (
    <Section title="Environment Variables" count={env.length}>
      <SectionList>
        {items.map((e) => (
          <li key={e.name} className="grid gap-1 px-3 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-medium text-foreground">{e.name}</span>
              <Badge variant={e.required ? "default" : "outline"}>
                {e.required ? "Required" : "Optional"}
              </Badge>
              <span className="font-mono text-muted-foreground/70">
                {"= "}
                {e.example}
              </span>
            </div>
            {e.description && <p className="text-muted-foreground/80">{e.description}</p>}
          </li>
        ))}
      </SectionList>
    </Section>
  );
}
