import {
  IconCircleCheck,
  IconInfoCircle,
  IconAlertTriangle,
  IconAlertOctagon,
  IconLoader,
} from "@tabler/icons-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/components/theme-provider";

const ICONS = {
  success: <IconCircleCheck className="size-4" />,
  info: <IconInfoCircle className="size-4" />,
  warning: <IconAlertTriangle className="size-4" />,
  error: <IconAlertOctagon className="size-4" />,
  loading: <IconLoader className="size-4 animate-spin" />,
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
