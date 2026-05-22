import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "oxlint-oxfmt",
  category: "tooling",
  label: "Oxlint + oxfmt",
  description: "Oxc's Rust-based linter and formatter — extremely fast.",
  version: "0.1.0",
  homepage: "https://oxc.rs",
  devDependencies: {
    oxlint: "^1.66.0",
    oxfmt: "^0.51.0",
  },
  scripts: {
    lint: "oxlint",
    "lint:fix": "oxlint --fix",
    format: "oxfmt",
  },
  // Framework-agnostic: one config works everywhere.
  adapters: [
    {
      key: "default",
      match: {},
      templates: [
        { src: "dot_oxlintrc.json", dest: ".oxlintrc.json", scope: "repo" },
        { src: "dot_oxfmtrc.json", dest: ".oxfmtrc.json", scope: "repo" },
      ],
    },
  ],
});
