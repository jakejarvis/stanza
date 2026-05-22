import { useCallback } from "react";

import { PackageManagerSelect } from "@/components/package-manager-select";
import { CopyableField } from "@/components/ui/copyable-field";
import { selectionProperties, useAnalytics } from "@/lib/analytics";
import type { PackageManager } from "@/lib/package-manager";
import { buildCommand, DEFAULT_NAME, type Selections } from "@/lib/selection";

/**
 * The `<pm> create stanza …` command box: a package-manager picker, the command
 * text, and a copy button. The package manager lives in the URL (lifted to the
 * builder), so the box is fully controlled — it builds the command from the
 * current selection and reports changes upward.
 */
export function CommandPreview({
  name,
  selections,
  pm,
  onPmChange,
}: {
  name: string;
  selections: Selections;
  pm: PackageManager;
  onPmChange: (pm: PackageManager) => void;
}) {
  const command = buildCommand({ name, selections, pm });
  const capture = useAnalytics();

  const onCopy = useCallback(() => {
    capture("builder_command_copied", {
      package_manager: pm,
      command,
      name_customized: name !== DEFAULT_NAME,
      module_count: Object.values(selections).reduce((n, ids) => n + (ids?.length ?? 0), 0),
      ...selectionProperties(selections),
    });
  }, [capture, pm, command, name, selections]);

  return (
    <div className="flex items-center gap-1.5">
      <PackageManagerSelect value={pm} onValueChange={onPmChange} />
      <CopyableField
        label="Install command"
        value={command}
        showLabel={false}
        copyLabel="Copy command"
        className="flex-1"
        onCopy={onCopy}
      />
    </div>
  );
}
