import type { CategoryId, ModuleSummary } from "@stanza/registry";

export function groupByCategory(
  modules: ModuleSummary[],
): Array<{ group: CategoryId; modules: ModuleSummary[] }> {
  const groups = new Map<CategoryId, ModuleSummary[]>();
  for (const m of modules) {
    const list = groups.get(m.category) ?? [];
    list.push(m);
    groups.set(m.category, list);
  }
  return [...groups.entries()].map(([group, mods]) => ({ group, modules: mods }));
}
