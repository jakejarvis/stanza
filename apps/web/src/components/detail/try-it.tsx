import { IconCopy } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TryIt({ command }: { command: string }) {
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  };

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
        Try it
      </h3>
      <div className="flex items-stretch gap-2">
        <pre className="flex-1 overflow-x-auto rounded-none border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
          <code>{command}</code>
        </pre>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="icon" onClick={onCopy} aria-label="Copy command">
                <IconCopy className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Copy</TooltipContent>
        </Tooltip>
      </div>
    </section>
  );
}
