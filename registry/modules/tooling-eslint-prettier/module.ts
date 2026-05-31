import { defineModule, type TemplateRef } from "@withstanza/schema";

// Same templates regardless of which framework adapter wins. The eslint config
// is a single Handlebars template that branches on `{{peers.framework}}`, so
// pure-TS, Next, and TanStack Start all render from the same source file.
const templates: TemplateRef[] = [
  { src: "eslint.config.mjs", dest: "eslint.config.mjs", scope: "repo", template: true },
  { src: "prettier.config.mjs", dest: "prettier.config.mjs", scope: "repo" },
];

export default defineModule({
  id: "eslint-prettier",
  category: "tooling",
  label: "ESLint + Prettier",
  description: "ESLint (flat config) for linting and Prettier for formatting.",
  version: "0.1.0",
  homepage: "https://eslint.org",
  // Framework-agnostic base; adapters layer on framework-specific plugins via
  // Handlebars conditionals in the shared template — same shape as the
  // tooling-biome / tooling-oxlint-oxfmt siblings, which also install without
  // a framework peer.
  devDependencies: {
    eslint: "^9.39.0",
    "@eslint/js": "^9.39.0",
    "typescript-eslint": "^8.46.0",
    prettier: "^3.6.2",
    "eslint-config-prettier": "^10.1.8",
  },
  scripts: {
    lint: "eslint .",
    format: "prettier --write .",
  },
  adapters: [
    {
      key: "next",
      match: { framework: "next" },
      devDependencies: {
        "@next/eslint-plugin-next": "^16.2.6",
        "eslint-plugin-react-hooks": "^7.0.0",
      },
      templates,
    },
    {
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      devDependencies: {
        "eslint-plugin-react": "^7.37.5",
        "eslint-plugin-react-hooks": "^7.0.0",
      },
      templates,
    },
    {
      key: "default",
      match: {},
      templates,
    },
  ],
});
