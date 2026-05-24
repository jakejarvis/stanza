import { Section, SectionList } from "@/components/detail/section";

/**
 * Renders a deps map as a key/value list. Used for `dependencies`,
 * `devDependencies`, and `scripts`. Returns `null` when the map is empty so
 * the page can simply drop the section.
 */
export function DepsTable({ title, entries }: { title: string; entries: Record<string, string> }) {
  const items = Object.entries(entries);
  if (items.length === 0) return null;

  return (
    <Section title={title}>
      <SectionList>
        {items.map(([name, version]) => (
          <li
            key={name}
            translate="no"
            className="flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs"
          >
            <span className="truncate text-foreground">{name}</span>
            <span className="shrink-0 text-muted-foreground">{version}</span>
          </li>
        ))}
      </SectionList>
    </Section>
  );
}
