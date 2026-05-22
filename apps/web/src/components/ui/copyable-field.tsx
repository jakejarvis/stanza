"use client";

import * as React from "react";

import { CopyButton } from "@/components/ui/copy-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type CopyableFieldCopyEvent = Parameters<
  NonNullable<React.ComponentProps<typeof CopyButton>["onCopied"]>
>[1];

type CopyableFieldProps = Omit<React.ComponentProps<typeof Field>, "children" | "onCopy"> & {
  label: React.ReactNode;
  value: string;
  copyValue?: string;
  showLabel?: boolean;
  copyLabel?: string;
  copiedLabel?: string;
  resetDelay?: number;
  children?: React.ReactNode;
  onCopy?: (value: string, event: CopyableFieldCopyEvent) => void;
  onCopyError?: (error: unknown, event: CopyableFieldCopyEvent) => void;
};

function CopyableField({
  label,
  value,
  copyValue = value,
  showLabel = true,
  copyLabel = "Copy to clipboard",
  copiedLabel = "Copied",
  resetDelay = 2000,
  children,
  className,
  onCopy,
  onCopyError,
  ...props
}: CopyableFieldProps) {
  const contentRef = React.useRef<HTMLSpanElement>(null);

  const handleSelect = React.useCallback(() => {
    if (!contentRef.current) {
      return;
    }

    const selection = window.getSelection();

    if (!selection) {
      return;
    }

    const range = document.createRange();

    range.selectNodeContents(contentRef.current);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  return (
    <Field className={cn("h-8 min-w-0", className)} {...props}>
      <FieldLabel className={cn(showLabel ? "text-xs text-muted-foreground uppercase" : "sr-only")}>
        {label}
      </FieldLabel>
      <InputGroup className="h-full min-w-0">
        <ScrollArea
          className="h-full min-w-0 flex-1 [&_[data-slot=scroll-area-content]]:h-full [&_[data-slot=scroll-area-scrollbar]]:hidden [&_[data-slot=scroll-area-viewport]]:overscroll-y-none"
          hideScrollbar
        >
          <button
            type="button"
            aria-label={typeof label === "string" ? `Select ${label}` : "Select text"}
            onClick={handleSelect}
            className="h-full w-full min-w-0 cursor-text bg-transparent py-0 pr-2 pl-3 text-left font-mono text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span ref={contentRef} translate="no" className="inline-block whitespace-nowrap">
              {children ?? value}
            </span>
          </button>
        </ScrollArea>
        <InputGroupAddon align="inline-end">
          <CopyButton
            value={copyValue}
            size="icon-sm"
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
            resetDelay={resetDelay}
            onCopied={onCopy}
            onCopyError={onCopyError}
          />
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}

export { CopyableField, type CopyableFieldProps };
