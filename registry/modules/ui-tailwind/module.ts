import { defineModule } from "@withstanza/schema";

export default defineModule({
  id: "tailwind",
  category: "ui",
  label: "Tailwind CSS",
  description: "Utility-first CSS framework, no primitives included.",
  version: "0.2.0",
  peers: { framework: ["next", "tanstack-start"] },
  homepage: "https://tailwindcss.com",
  // `tailwindcss` itself is shared; the per-framework integration dep varies.
  devDependencies: { tailwindcss: "^4.3.0" },
  adapters: [
    {
      key: "next",
      match: { framework: "next" },
      devDependencies: {
        "@tailwindcss/postcss": "^4.3.0",
        postcss: "^8.5.15",
      },
      templates: [
        // Real plugin config lives in `packages/ui/` alongside the deps so
        // pnpm's isolated linker exposes `@tailwindcss/postcss` to it. The
        // app's `postcss.config.mjs` just re-exports it via the workspace
        // package's subpath export.
        { src: "package/postcss.config.mjs", dest: "postcss.config.mjs", scope: "package" },
        {
          src: "next/postcss.config.mjs",
          dest: "postcss.config.mjs",
          scope: "app",
          template: true,
        },
      ],
      codemods: [
        {
          // framework-next ships its own `app/globals.css` with base styles.
          // Prepend Tailwind's `@import` so the CSS is well-formed (@import
          // must precede all other rules) and we don't fight the framework
          // module for ownership of the whole file.
          id: "append-to-file",
          args: {
            file: "app/globals.css",
            content: '@import "tailwindcss";',
            marker: "tailwind",
            position: "start",
          },
        },
      ],
    },
    {
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      devDependencies: { "@tailwindcss/vite": "^4.3.0" },
      codemods: [
        {
          // framework-tanstack-start ships `src/globals.css` (imported from
          // `__root.tsx`); prepend Tailwind's `@import` so CSS stays valid
          // (@import must precede all other rules). Same shape as the next
          // adapter for symmetry.
          id: "append-to-file",
          args: {
            file: "src/globals.css",
            content: '@import "tailwindcss";',
            marker: "tailwind",
            position: "start",
          },
        },
        {
          // Splice tailwindcss() into the framework's existing vite.config.ts
          // between tanstackStart() and react() — Start's plugin order is
          // strict, and we want Tailwind compiled before React's JSX transform.
          id: "add-plugin-to-call",
          args: {
            file: "vite.config.ts",
            callee: "defineConfig",
            property: "plugins",
            call: "tailwindcss()",
            imports: [{ from: "@tailwindcss/vite", default: "tailwindcss" }],
            position: "before:react",
          },
        },
      ],
    },
  ],
});
