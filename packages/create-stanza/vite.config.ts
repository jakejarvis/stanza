import { defineConfig } from "vite-plus";

export default defineConfig({
  /**
   * `create-stanza` is a thin shim over `stanza-cli`. We compile its TS to
   * ESM but externalize EVERYTHING — including `stanza-cli` itself, which
   * the user installs alongside `create-stanza` via npm's normal dep chain
   * (it's in `dependencies`). Inlining `stanza-cli` here would also pull in
   * its transitive 12 MB of ts-morph and friends.
   */
  pack: {
    entry: ["./src/bin.ts"],
    format: "esm",
    target: "node22",
    platform: "node",
    clean: true,
  },
});
