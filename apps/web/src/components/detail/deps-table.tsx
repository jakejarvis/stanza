/**
 * Renders a deps map as a key/value list. Used for `dependencies`,
 * `devDependencies`, and `scripts`. Returns `null` when the map is empty so
 * the page can simply drop the section.
 */
export function DepsTable({ title, entries }: { title: string; entries: Record<string, string> }) {
  const items = Object.entries(entries);
  if (items.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="divide-y divide-border rounded-none border border-border">
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
      </ul>
    </section>
  );
}
