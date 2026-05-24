import { useState } from "react";

import { CommandPreview } from "@/components/command-preview";
import { Section } from "@/components/detail/section";
import { DEFAULT_PACKAGE_MANAGER, type PackageManager } from "@/lib/package-manager";
import type { Selections } from "@/lib/selection";

export function Install({ name, selections }: { name: string; selections: Selections }) {
  const [pm, setPm] = useState<PackageManager>(DEFAULT_PACKAGE_MANAGER);
  return (
    <Section title="Install">
      <CommandPreview name={name} selections={selections} pm={pm} onPmChange={setPm} />
    </Section>
  );
}
