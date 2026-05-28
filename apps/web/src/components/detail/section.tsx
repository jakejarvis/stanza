import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[13px] font-medium tracking-tight text-muted-foreground">{title}</h3>
        {count !== undefined && (
          <Badge
            variant="secondary"
            className="h-auto px-1.5 py-1 font-mono text-[11px] leading-none tabular-nums"
          >
            {count}
          </Badge>
        )}
      </div>
      {children}
    </section>
  );
}

export function SectionList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-border rounded-none border border-border">{children}</ul>;
}
