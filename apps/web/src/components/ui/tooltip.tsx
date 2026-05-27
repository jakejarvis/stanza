"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import * as React from "react";

import { usePointerCapability } from "@/hooks/use-pointer-capability";
import { cn } from "@/lib/utils";

type TooltipContextValue = {
  isTouchDevice: boolean;
};

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function TooltipProvider({ delay = 0, children, ...props }: TooltipPrimitive.Provider.Props) {
  const { isTouchDevice } = usePointerCapability();
  const contextValue = React.useMemo(() => ({ isTouchDevice }), [isTouchDevice]);

  return (
    <TooltipContext.Provider value={contextValue}>
      <TooltipPrimitive.Provider delay={delay} {...props}>
        {children}
      </TooltipPrimitive.Provider>
    </TooltipContext.Provider>
  );
}

function Tooltip({ ...props }: PopoverPrimitive.Root.Props & TooltipPrimitive.Root.Props) {
  const { isTouchDevice } = useTooltipContext("Tooltip");

  return isTouchDevice ? (
    <PopoverPrimitive.Root data-slot="tooltip" {...props} />
  ) : (
    <TooltipPrimitive.Root data-slot="tooltip" {...props} />
  );
}

function TooltipTrigger({
  nativeButton,
  closeDelay,
  ...props
}: Omit<TooltipPrimitive.Trigger.Props & PopoverPrimitive.Trigger.Props, "handle"> &
  Pick<PopoverPrimitive.Trigger.Props, "nativeButton">) {
  const ctx = useTooltipContext("TooltipTrigger");
  const { Trigger } = ctx.isTouchDevice ? PopoverPrimitive : TooltipPrimitive;
  const triggerProps = ctx.isTouchDevice
    ? ({
        nativeButton,
        openOnHover: true,
      } satisfies PopoverPrimitive.Trigger.Props)
    : ({
        closeDelay: closeDelay ?? 150,
      } satisfies TooltipPrimitive.Trigger.Props);

  return <Trigger data-slot="tooltip-trigger" {...props} {...triggerProps} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  PopoverPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  const ctx = useTooltipContext("TooltipContent");
  const { Portal, Positioner, Popup, Arrow } = ctx.isTouchDevice
    ? PopoverPrimitive
    : TooltipPrimitive;

  return (
    <Portal>
      <Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="pointer-events-auto isolate z-50"
      >
        <Popup
          data-slot="tooltip-content"
          className={cn(
            "relative z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 overflow-visible rounded-none bg-foreground px-2 py-1 text-xs text-background shadow-md selection:bg-background selection:text-foreground has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-none data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          <Arrow className="size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-none bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
          <div className="relative z-10">{children}</div>
        </Popup>
      </Positioner>
    </Portal>
  );
}

function useTooltipContext(componentName: string) {
  const ctx = React.use(TooltipContext);

  if (!ctx) {
    throw new Error(`${componentName} must be used within <TooltipProvider>.`);
  }

  return ctx;
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
