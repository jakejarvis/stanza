import { defineModule } from "@withstanza/schema";

export default defineModule({
  id: "playwright",
  category: "testing",
  label: "Playwright",
  description: "End-to-end browser testing.",
  version: "0.1.0",
  homepage: "https://playwright.dev",
  peers: { framework: ["next", "tanstack-start"] },
  devDependencies: { "@playwright/test": "^1.56.0" },
  // Disjoint script keys from vitest's `test`/`test:watch` — both testing
  // add-ons can coexist in one project without a region conflict.
  scripts: {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
  },
  adapters: [
    {
      // Next dev server.
      key: "next",
      match: { framework: "next" },
      templates: [
        { src: "next/playwright.config.ts", dest: "playwright.config.ts", scope: "app" },
        { src: "example.spec.ts", dest: "e2e/example.spec.ts", scope: "app" },
      ],
    },
    {
      // TanStack Start runs on the Vite dev server.
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      templates: [
        { src: "tanstack/playwright.config.ts", dest: "playwright.config.ts", scope: "app" },
        { src: "example.spec.ts", dest: "e2e/example.spec.ts", scope: "app" },
      ],
    },
  ],
});
