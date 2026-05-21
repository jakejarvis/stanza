import { CopyButton } from "@/components/copy-button";

export function TryIt({ command }: { command: string }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
        Try it
      </h3>
      <div className="flex items-stretch gap-2">
        <pre className="no-scrollbar flex h-8 min-w-0 flex-1 items-center overflow-x-auto rounded-none border border-border bg-muted/50 px-3 font-mono text-[11px] whitespace-pre sm:text-xs">
          <code>{command}</code>
        </pre>
        <CopyButton value={command} />
      </div>
    </section>
  );
}
