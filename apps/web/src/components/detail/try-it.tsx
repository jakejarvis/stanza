import { CopyButton } from "@/components/copy-button";

export function TryIt({ command }: { command: string }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
        Try it
      </h3>
      <div className="flex items-stretch gap-2">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-none border border-border bg-muted/50 px-3 py-2 font-mono text-[11px] whitespace-pre sm:text-xs">
          <code>{command}</code>
        </pre>
        <CopyButton value={command} className="h-auto!" />
      </div>
    </section>
  );
}
