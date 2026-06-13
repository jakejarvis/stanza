import { track } from "@vercel/analytics";
import { DEFAULT_PACKAGE_MANAGER, type CategoryId, type PackageManager } from "@withstanza/schema";
import { useState } from "react";

import { Section } from "@/components/detail/section";
import { PackageManagerSelect } from "@/components/package-manager-select";
import { CopyableField } from "@/components/ui/copyable-field";
import { buildAddCommand } from "@/lib/selection";

/**
 * The command box for adding this module to an existing Stanza project. The
 * package-manager picker swaps the dlx-style runner that fronts `stanza-cli`.
 */
export function Install({ category, id }: { category: CategoryId; id: string }) {
  const [pm, setPm] = useState<PackageManager>(DEFAULT_PACKAGE_MANAGER);
  const command = buildAddCommand({ category, id, pm });
  return (
    <Section title="Install">
      <div className="flex items-center gap-1.5">
        <PackageManagerSelect value={pm} onValueChange={setPm} />
        <CopyableField
          label="Install command"
          value={command}
          showLabel={false}
          copyLabel="Copy command"
          className="flex-1"
          onCopy={() => track("module_add_command_copied", { package_manager: pm, category, id })}
        />
      </div>
    </Section>
  );
}
