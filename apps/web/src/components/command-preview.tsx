import { useCallback } from "react";

import { CopyButton } from "@/components/copy-button";
import { PackageManagerSelect } from "@/components/package-manager-select";
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

  const onCopied = useCallback(() => {
    capture("builder_command_copied", {
      package_manager: pm,
      command,
      name_customized: name !== DEFAULT_NAME,
      module_count: Object.values(selections).reduce((n, ids) => n + (ids?.length ?? 0), 0),
      ...selectionProperties(selections),
    });
  }, [capture, pm, command, name, selections]);

  return (
    <div className="flex items-stretch gap-2">
      <PackageManagerSelect value={pm} onValueChange={onPmChange} />
      <pre className="no-scrollbar flex h-8 min-w-0 flex-1 items-center overflow-x-auto rounded-none border border-border bg-muted/50 px-3 font-mono text-[11px] whitespace-pre [font-variant-ligatures:none] sm:text-xs">
        <code>{command}</code>
      </pre>
      <CopyButton value={command} onCopied={onCopied} />
    </div>
  );
}
