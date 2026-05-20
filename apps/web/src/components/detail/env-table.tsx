import type { EnvVar } from "@stanza/registry";

import { Badge } from "@/components/ui/badge";

export function EnvTable({ env }: { env: EnvVar[] }) {
  if (env.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
        Environment variables
      </h3>
      <ul className="divide-y divide-border rounded-none border border-border">
        {env.map((e) => (
          <li key={e.name} className="grid gap-1 px-3 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-medium text-foreground">{e.name}</span>
              <Badge variant={e.required ? "default" : "outline"}>
                {e.required ? "required" : "optional"}
              </Badge>
              <span className="font-mono text-muted-foreground/70">= {e.example}</span>
            </div>
            {e.description && <p className="text-muted-foreground/80">{e.description}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
