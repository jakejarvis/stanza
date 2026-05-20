import type { ModuleSummary, RegistryIndex, SlotId } from "@stanza/registry";
import { resolveAdapter, slotOrder, emptyManifest } from "@stanza/registry";
import { useMemo, useState } from "react";

type Selections = Partial<Record<SlotId, string>>;

export function Builder({ index }: { index: RegistryIndex }) {
  const [selections, setSelections] = useState<Selections>({});
  const [name, setName] = useState("my-app");

  const moduleById = useMemo(() => {
    const m = new Map<string, ModuleSummary>();
    for (const mod of index.modules) m.set(`${mod.slot}:${mod.id}`, mod);
    return m;
  }, [index]);

  const compatibleBySlot = useMemo(() => {
    const out: Record<SlotId, ModuleSummary[]> = {
      framework: [],
      styling: [],
      db: [],
      orm: [],
      auth: [],
    };
    const pending = pendingFromSelections(selections, moduleById);
    for (const slot of slotOrder) {
      out[slot] = index.modules
        .filter((m) => m.slot === slot)
        .filter((m) => {
          const synthetic = { ...m, adapters: m.adapters.map((a) => ({ ...a })) };
          return resolveAdapter(synthetic, {
            manifest: emptyManifest({ name: "t" }),
            pending,
          }).ok;
        });
    }
    return out;
  }, [index, selections, moduleById]);

  const command = useMemo(() => buildCommand(name, selections), [name, selections]);

  return (
    <div>
      <label style={{ display: "block", marginBottom: "1rem" }}>
        <div>Project name</div>
        <input
          aria-label="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: "0.5rem", width: "100%" }}
        />
      </label>

      {slotOrder.map((slot) => (
        <fieldset
          key={slot}
          style={{ margin: "0 0 1rem 0", padding: "0.75rem", border: "1px solid #ddd" }}
        >
          <legend>{slotLabel(slot)}</legend>
          {compatibleBySlot[slot].length === 0 ? (
            <div style={{ opacity: 0.6 }}>No compatible modules with current picks.</div>
          ) : (
            compatibleBySlot[slot].map((m) => (
              <label key={m.id} style={{ display: "block" }}>
                <input
                  type="radio"
                  name={slot}
                  aria-label={m.label}
                  checked={selections[slot] === m.id}
                  onChange={() => setSelections((s) => ({ ...s, [slot]: m.id }))}
                />{" "}
                <strong>{m.label}</strong> <span style={{ opacity: 0.7 }}>{m.description}</span>
              </label>
            ))
          )}
        </fieldset>
      ))}

      <pre style={{ background: "#111", color: "#eee", padding: "1rem", borderRadius: "0.25rem" }}>
        {command}
      </pre>
    </div>
  );
}

function pendingFromSelections(selections: Selections, moduleById: Map<string, ModuleSummary>) {
  const pending: Record<string, ModuleSummary> = {};
  for (const [slot, id] of Object.entries(selections)) {
    if (!id) continue;
    const mod = moduleById.get(`${slot}:${id}`);
    if (mod) pending[slot] = mod;
  }
  // The resolver expects full Modules; the empty `adapters` slot bodies don't
  // matter for peer-validation, so cast is safe.
  return pending as Parameters<typeof resolveAdapter>[1]["pending"];
}

function buildCommand(name: string, selections: Selections): string {
  const flags = slotOrder
    .map((s) => (selections[s] ? `--${s}=${selections[s]}` : null))
    .filter(Boolean)
    .join(" ");
  return `pnpm create stanza ${name} ${flags}`.trim();
}

function slotLabel(slot: SlotId): string {
  return { framework: "Framework", styling: "Styling", db: "Database", orm: "ORM", auth: "Auth" }[
    slot
  ];
}
