import { CommandPreview } from "@/components/command-preview";
import type { Selections } from "@/lib/selection";

export function TryIt({ name, selections }: { name: string; selections: Selections }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
        Try it
      </h3>
      <CommandPreview name={name} selections={selections} />
    </section>
  );
}
