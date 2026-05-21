import { defineModule } from "@stanza/registry";

export default defineModule({
  kind: "addon",
  id: "vitest",
  category: "testing",
  label: "Vitest",
  description: "Fast unit + integration test runner powered by Vite.",
  version: "0.1.0",
  homepage: "https://vitest.dev",
  // One-way constraint: needs a framework, but never constrains anyone else.
  peers: { framework: ["next", "tanstack-start"] },
  // Shared across adapters. `scripts.test` is disjoint from playwright's
  // `test:e2e`, so the two testing add-ons never claim the same region.
  devDependencies: {
    vitest: "^4.1.7",
    jsdom: "^29.1.1",
    "@testing-library/react": "^16.3.2",
  },
  scripts: {
    test: "vitest run",
    "test:watch": "vitest",
  },
  adapters: [
    {
      // Next has no Vite pipeline of its own, so the React plugin is added here.
      key: "next",
      match: { framework: "next" },
      devDependencies: { "@vitejs/plugin-react": "^6.0.2" },
      templates: [
        { src: "vitest.config.ts", dest: "vitest.config.ts", scope: "app" },
        { src: "example.test.ts", dest: "tests/example.test.ts", scope: "app" },
      ],
    },
    {
      // TanStack Start already ships `@vitejs/plugin-react` (the framework
      // module installs it), so the adapter only adds the config + example.
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      templates: [
        { src: "vitest.config.ts", dest: "vitest.config.ts", scope: "app" },
        { src: "example.test.ts", dest: "tests/example.test.ts", scope: "app" },
      ],
    },
  ],
});
