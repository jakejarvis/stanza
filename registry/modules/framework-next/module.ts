import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "next",
  category: "framework",
  label: "Next.js",
  description: "React framework with App Router, RSC, and edge runtime.",
  version: "0.1.0",
  homepage: "https://nextjs.org",
  adapters: [
    {
      key: "default",
      match: {},
      dependencies: {
        next: "^16.2.6",
        react: "^19.2.6",
        "react-dom": "^19.2.6",
      },
      devDependencies: {
        "@types/react": "^19.2.15",
        "@types/react-dom": "^19.2.3",
        typescript: "^6.0.3",
      },
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
      },
      templates: [
        { src: "tsconfig.json", dest: "tsconfig.json", scope: "app" },
        { src: "next.config.ts", dest: "next.config.ts", scope: "app" },
        { src: "next-env.d.ts", dest: "next-env.d.ts", scope: "app" },
        { src: "app/layout.tsx", dest: "app/layout.tsx", scope: "app" },
        { src: "app/page.tsx", dest: "app/page.tsx", scope: "app" },
        { src: "app/globals.css", dest: "app/globals.css", scope: "app" },
      ],
    },
  ],
});
