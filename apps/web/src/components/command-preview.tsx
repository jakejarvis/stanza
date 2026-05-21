import { CopyButton } from "@/components/copy-button";
import { PackageManagerSelect } from "@/components/package-manager-select";
import { usePackageManager } from "@/lib/package-manager";
import { type AddonSelections, buildCommand, type Selections } from "@/lib/selection";

/**
 * The `<pm> create stanza …` command box: a package-manager picker, the command
 * text, and a copy button. Owns the persisted package-manager preference and
 * builds the command from the current selection.
 */
export function CommandPreview({
  name,
  selections,
  addons,
}: {
  name: string;
  selections: Selections;
  addons?: AddonSelections;
}) {
  const { pm, setPm } = usePackageManager();
  const command = buildCommand({ name, selections, addons, pm });

  return (
    <div className="flex items-stretch gap-2">
      <PackageManagerSelect value={pm} onValueChange={setPm} />
      <pre className="no-scrollbar flex h-8 min-w-0 flex-1 items-center overflow-x-auto rounded-none border border-border bg-muted/50 px-3 font-mono text-[11px] whitespace-pre [font-variant-ligatures:none] sm:text-xs">
        <code>{command}</code>
      </pre>
      <CopyButton value={command} />
    </div>
  );
}
