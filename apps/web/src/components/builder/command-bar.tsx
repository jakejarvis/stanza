import { IconCopy } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function CommandBar({
  name,
  defaultName,
  command,
  onNameChange,
}: {
  name: string;
  defaultName: string;
  command: string;
  onNameChange: (name: string) => void;
}) {
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  };

  return (
    <Card className="gap-4 p-5">
      <div className="space-y-1.5">
        <label htmlFor="stanza-project-name" className="text-xs font-medium text-muted-foreground">
          Project name
        </label>
        <Input
          id="stanza-project-name"
          value={name}
          placeholder={defaultName}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Run this</span>
        <div className="flex items-stretch gap-2">
          <pre className="flex-1 overflow-x-auto rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
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
      </div>
    </Card>
  );
}
