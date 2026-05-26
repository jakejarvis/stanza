import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "turbo",
  category: "monorepo",
  label: "Turborepo",
  description: "Incremental task runner with content-addressed caching.",
  version: "0.1.0",
  homepage: "https://turborepo.dev",
  devDependencies: { turbo: "^2.9.0" },
  // Overwrite the pm-native fan-out scripts that `rootPackageJson` seeds.
  // The runner's `addPackageScript` replaces values unconditionally, and the
  // synth path matches — see [packages/registry/src/package-json.ts] `applyFields`.
  scripts: {
    dev: "turbo run dev",
    build: "turbo run build",
    test: "turbo run test",
    lint: "turbo run lint",
  },
  adapters: [
    {
      key: "default",
      match: {},
      // Templated so `build.outputs` branches on the selected framework — each
      // emits to a different directory (.next vs .output vs dist).
      templates: [{ src: "turbo.json", dest: "turbo.json", scope: "repo", template: true }],
      // Append `.turbo/` to .gitignore for projects that didn't init with it.
      // Idempotent: fresh `stanza init` already lists `.turbo/`, so the marker
      // block is a no-op there; `stanza add monorepo turbo` on an old project
      // gains the entry.
      codemods: [
        {
          id: "append-to-file",
          args: {
            file: ".gitignore",
            scope: "repo",
            marker: "monorepo-turbo",
            content: ".turbo/",
          },
        },
      ],
    },
  ],
});
