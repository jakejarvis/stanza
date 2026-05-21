import { IconCopy } from "@tabler/icons-react";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Icon button that copies `value` to the clipboard, wrapped in a tooltip. */
export function CopyButton({
  value,
  label = "Copy command",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  }, [value]);

  const trigger = useMemo(
    () => (
      <Button
        variant="outline"
        size="icon"
        onClick={onCopy}
        aria-label={label}
        className={className}
      >
        <IconCopy className="size-4" />
      </Button>
    ),
    [onCopy, label, className],
  );

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent>Copy</TooltipContent>
    </Tooltip>
  );
}
