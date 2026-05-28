import {
  IconCircleCheck,
  IconInfoCircle,
  IconAlertTriangle,
  IconAlertOctagon,
  IconLoader2,
} from "@tabler/icons-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/components/theme-provider";

const ICONS = {
  success: <IconCircleCheck aria-hidden="true" className="size-4" />,
  info: <IconInfoCircle aria-hidden="true" className="size-4" />,
  warning: <IconAlertTriangle aria-hidden="true" className="size-4" />,
  error: <IconAlertOctagon aria-hidden="true" className="size-4" />,
  loading: (
    <IconLoader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
  ),
};

// CSS custom properties aren't representable in React.CSSProperties (csstype
// has no `--*` index signature), so the cast is the standard escape hatch.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const STYLE = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius)",
} as React.CSSProperties;

const TOAST_OPTIONS = {
  classNames: {
    toast: "cn-toast",
  },
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme: theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={ICONS}
      style={STYLE}
      toastOptions={TOAST_OPTIONS}
      {...props}
    />
  );
};

export { Toaster };
