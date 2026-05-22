import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "eslint-prettier",
  category: "tooling",
  label: "ESLint + Prettier",
  description: "ESLint (flat config) for linting and Prettier for formatting.",
  version: "0.1.0",
  homepage: "https://eslint.org",
  // ESLint config differs per framework, so dispatch on the framework pick.
  peers: { framework: ["next", "tanstack-start"] },
  devDependencies: {
    eslint: "^9.39.0",
    "@eslint/js": "^9.39.0",
    "typescript-eslint": "^8.46.0",
    "eslint-plugin-react-hooks": "^7.0.0",
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
      devDependencies: { "@next/eslint-plugin-next": "^16.2.6" },
      templates: [
        { src: "eslint.config.next.mjs", dest: "eslint.config.mjs", scope: "repo" },
        { src: "prettier.config.mjs", dest: "prettier.config.mjs", scope: "repo" },
      ],
    },
    {
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      devDependencies: { "eslint-plugin-react": "^7.37.5" },
      templates: [
        { src: "eslint.config.tanstack.mjs", dest: "eslint.config.mjs", scope: "repo" },
        { src: "prettier.config.mjs", dest: "prettier.config.mjs", scope: "repo" },
      ],
    },
  ],
});
