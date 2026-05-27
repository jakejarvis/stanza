import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-medium tracking-tight text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function SectionList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-border rounded-none border border-border">{children}</ul>;
}
