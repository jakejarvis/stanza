import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "tailwind",
  slot: "styling",
  label: "Tailwind CSS",
  description: "Utility-first CSS framework. Pairs with any web framework.",
  version: "0.1.0",
  requires: ["web"],
  peers: { framework: ["next", "tanstack-start"] },
  homepage: "https://tailwindcss.com",
  adapters: [
    {
      key: "next",
      match: { framework: "next" },
      devDependencies: {
        "@tailwindcss/postcss": "^4.3.0",
        postcss: "^8.5.15",
        tailwindcss: "^4.3.0",
      },
      templates: [
        { src: "next/postcss.config.mjs", dest: "postcss.config.mjs", scope: "app" },
        { src: "globals.css", dest: "app/globals.css", scope: "app" },
      ],
    },
    {
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      devDependencies: {
        "@tailwindcss/vite": "^4.3.0",
        tailwindcss: "^4.3.0",
      },
      templates: [{ src: "globals.css", dest: "src/globals.css", scope: "app" }],
      codemods: [
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
