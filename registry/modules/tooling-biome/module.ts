import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "biome",
  slot: "tooling",
  label: "Biome",
  description: "Fast Rust-based linter and formatter in one tool.",
  version: "0.1.0",
  homepage: "https://biomejs.dev",
  devDependencies: { "@biomejs/biome": "^2.3.10" },
  scripts: {
    lint: "biome lint .",
    format: "biome format --write .",
    check: "biome check --write .",
  },
  // Framework-agnostic: one config works everywhere.
  adapters: [
    {
      key: "default",
      match: {},
      templates: [{ src: "biome.json", dest: "biome.json", scope: "repo" }],
    },
  ],
});
