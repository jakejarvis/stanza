import { DEFAULT_NAMESPACE, parseModuleSpec, type StanzaManifest } from "@stanza/registry";
import { defineCommand } from "citty";
import pc from "picocolors";

import { findProjectRoot, readManifest } from "../lib/manifest";
import { loadRegistries } from "../lib/registry-loader";
import { commonArgs, type CliArgs } from "./_args";

export const search = defineCommand({
  meta: { name: "search", description: "Search the registry." },
  args: {
    query: {
      type: "positional",
      required: false,
      description: "Filter modules by text. Prefix with @ns/ to restrict to one registry.",
    },
    ...commonArgs,
  },
  run: ({ args }) => cmdSearch(args),
});

export async function cmdSearch(args: CliArgs): Promise<void> {
  // If we're inside a project, load its manifest so configured third-party
  // registries fan out alongside @stanza. Outside a project, only @stanza
  // is searchable. A malformed manifest just disables the fan-out — don't
  // break `search` because of an unrelated parse error.
  const projectRoot = findProjectRoot();
  let manifest: StanzaManifest | undefined;
  if (projectRoot) {
    try {
      manifest = readManifest(projectRoot);
    } catch {
      // Leave `manifest` undefined — fan-out disabled, @stanza still works.
    }
  }
  const registry = await loadRegistries(manifest);

  const raw = typeof args.query === "string" ? args.query.trim() : "";
  const { namespace: nsFilter, id: text } = raw ? parseModuleSpec(raw) : { id: "" };
  const q = text.toLowerCase();

  const indices = registry.searchableIndices();
  const hits: {
    namespace: string;
    module: (typeof indices)[number]["index"]["modules"][number];
  }[] = [];
  for (const { namespace, index } of indices) {
    if (nsFilter && namespace !== nsFilter) continue;
    for (const m of index.modules) {
      if (!q) {
        hits.push({ namespace, module: m });
        continue;
      }
      if (
        m.id.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.category.includes(q)
      ) {
        hits.push({ namespace, module: m });
      }
    }
  }

  if (hits.length === 0) {
    if (nsFilter && !registry.namespaces().includes(nsFilter)) {
      console.log(pc.dim(`Unknown registry "${nsFilter}". Add it to stanza.json.`));
    } else if (nsFilter && !indices.some(({ namespace }) => namespace === nsFilter)) {
      // Namespace IS configured but exposes no browsable index (no `indexUrl`,
      // or it 404'd / parse-failed). Modules are still reachable by name.
      console.log(
        pc.dim(
          `Registry "${nsFilter}" has no browsable index — use ` +
            `\`stanza add <category> ${nsFilter}/<id>\` to fetch by name.`,
        ),
      );
    } else {
      console.log(pc.dim("No modules found."));
    }
    return;
  }

  for (const { namespace, module: m } of hits) {
    // Hide the @stanza prefix on first-party hits to keep the common case
    // terse — only show the namespace when it's third-party.
    const nsTag = namespace === DEFAULT_NAMESPACE ? "" : `${namespace}/`;
    const head = `${pc.bold(m.label)} ${pc.dim(`(${m.category}/${nsTag}${m.id})`)}`;
    const desc = m.description ? `  ${pc.dim(m.description)}` : "";
    console.log(`${head}\n${desc}`);
  }
}
