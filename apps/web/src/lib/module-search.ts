import type { CategoryId, ModuleMetadata } from "@withstanza/schema";

export function groupByCategory(
  modules: ModuleMetadata[],
): Array<{ group: CategoryId; modules: ModuleMetadata[] }> {
  const groups = new Map<CategoryId, ModuleMetadata[]>();
  for (const m of modules) {
    const list = groups.get(m.category) ?? [];
    list.push(m);
    groups.set(m.category, list);
  }
  return [...groups.entries()].map(([group, mods]) => ({ group, modules: mods }));
}
