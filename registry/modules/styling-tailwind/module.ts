import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "tailwind",
  slot: "styling",
  label: "Tailwind CSS",
  description: "Utility-first CSS framework. Pairs with any web framework.",
  version: "0.1.0",
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
      templates: [{ src: "next/postcss.config.mjs", dest: "postcss.config.mjs", scope: "app" }],
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
          id: "add-vite-plugin",
          args: {
            call: "tailwindcss()",
            importFrom: "@tailwindcss/vite",
            importName: "tailwindcss",
            importKind: "default",
            position: "before:react",
          },
        },
      ],
    },
  ],
});
