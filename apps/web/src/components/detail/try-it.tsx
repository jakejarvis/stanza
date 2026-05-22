import { useState } from "react";

import { CommandPreview } from "@/components/command-preview";
import { DEFAULT_PACKAGE_MANAGER, type PackageManager } from "@/lib/package-manager";
import type { Selections } from "@/lib/selection";

export function TryIt({ name, selections }: { name: string; selections: Selections }) {
  const [pm, setPm] = useState<PackageManager>(DEFAULT_PACKAGE_MANAGER);
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
        Try it
      </h3>
      <CommandPreview name={name} selections={selections} pm={pm} onPmChange={setPm} />
    </section>
  );
}
