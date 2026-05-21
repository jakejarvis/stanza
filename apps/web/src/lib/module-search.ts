import type { AddonCategoryId, ModuleSummary, SlotId } from "@stanza/registry";
import { moduleGroup } from "@stanza/registry";

export function groupBySlot(
  modules: ModuleSummary[],
): Array<{ group: SlotId | AddonCategoryId; modules: ModuleSummary[] }> {
  const groups = new Map<SlotId | AddonCategoryId, ModuleSummary[]>();
  for (const m of modules) {
    const key = moduleGroup(m);
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([group, mods]) => ({ group, modules: mods }));
}
