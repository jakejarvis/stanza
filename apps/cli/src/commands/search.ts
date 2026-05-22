import { defineCommand } from "citty";
import pc from "picocolors";

import { loadRegistry } from "../lib/registry-loader";
import { commonArgs, type CliArgs } from "./_args";

export const search = defineCommand({
  meta: { name: "search", description: "Search the registry." },
  args: {
    query: { type: "positional", required: false, description: "Filter modules by text." },
    ...commonArgs,
  },
  run: ({ args }) => cmdSearch(args),
});

export async function cmdSearch(args: CliArgs): Promise<void> {
  const registry = await loadRegistry();
  const q = (typeof args.query === "string" ? args.query : "").toLowerCase().trim();

  const results = registry.index.modules.filter((m) => {
    if (!q) return true;
    return (
      m.id.toLowerCase().includes(q) ||
      m.label.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.category.includes(q)
    );
  });

  if (results.length === 0) {
    console.log(pc.dim("No modules found."));
    return;
  }

  for (const m of results) {
    const head = `${pc.bold(m.label)} ${pc.dim(`(${m.category}/${m.id})`)}`;
    const desc = m.description ? `  ${pc.dim(m.description)}` : "";
    console.log(`${head}\n${desc}`);
  }
}
