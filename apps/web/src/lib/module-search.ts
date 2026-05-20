import type { ModuleSummary, SlotId } from "@stanza/registry";

export function groupBySlot(
  modules: ModuleSummary[],
): Array<{ slot: SlotId; modules: ModuleSummary[] }> {
  const groups = new Map<SlotId, ModuleSummary[]>();
  for (const m of modules) {
    const list = groups.get(m.slot) ?? [];
    list.push(m);
    groups.set(m.slot, list);
  }
  return [...groups.entries()].map(([slot, mods]) => ({ slot, modules: mods }));
}
