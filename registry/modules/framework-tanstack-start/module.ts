import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "tanstack-start",
  slot: "framework",
  label: "TanStack Start",
  description: "Full-stack React framework on Vite + TanStack Router.",
  version: "0.1.0",
  homepage: "https://tanstack.com/start",
  adapters: [
    {
      key: "default",
      match: {},
      dependencies: {
        "@tanstack/react-router": "^1.170.5",
        "@tanstack/react-start": "^1.168.7",
        react: "^19.2.6",
        "react-dom": "^19.2.6",
      },
      devDependencies: {
        "@types/react": "^19.2.15",
        "@types/react-dom": "^19.2.3",
        "@vitejs/plugin-react": "^6.0.2",
        typescript: "^6.0.3",
        vite: "^8.0.13",
      },
      scripts: {
        dev: "vite dev",
        build: "vite build",
        start: "node .output/server/index.mjs",
      },
      templates: [
        { src: "vite.config.ts", dest: "vite.config.ts", scope: "app" },
        { src: "tsconfig.json", dest: "tsconfig.json", scope: "app" },
        { src: "src/router.tsx", dest: "src/router.tsx", scope: "app" },
        { src: "src/routes/__root.tsx", dest: "src/routes/__root.tsx", scope: "app" },
        { src: "src/routes/index.tsx", dest: "src/routes/index.tsx", scope: "app" },
      ],
    },
  ],
});
