import { CommandPreview } from "@/components/command-preview";
import type { AddonSelections, Selections } from "@/lib/selection";

export function TryIt({
  name,
  selections,
  addons,
}: {
  name: string;
  selections: Selections;
  addons?: AddonSelections;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
        Try it
      </h3>
      <CommandPreview name={name} selections={selections} addons={addons} />
    </section>
  );
}
