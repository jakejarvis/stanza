import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

import { version as cliVersion } from "../cli/package.json" with { type: "json" };
import { listPrerenderPages } from "./src/lib/prerender.ts";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(cliVersion),
  },
  plugins: lazyPlugins(async () => [
    mdx(await import("./source.config.ts")),
    devtools(),
    nitro({
      serverAssets: [
        {
          baseName: "registry",
          dir: ".registry",
        },
      ],
      vercel: {
        config: {
          version: 3,
          routes: [
            {
              src: "^/(llms(?:-full)?\\.txt)$",
              dest: "/docs/$1",
            },
            {
              src: "^/(schema(@[\\d.]+)?\\.json|registry/.*(@[\\d.]+)?\\.json)$",
              dest: "https://cti6xxqykwjha3x9.public.blob.vercel-storage.com/$1",
              headers: {
                "x-vercel-enable-rewrite-caching": "1",
              },
            },
          ],
        },
      },
    }),
    tailwindcss(),
    tanstackStart({
      rsc: { enabled: true },
      pages: listPrerenderPages(),
      prerender: {
        enabled: true,
        crawlLinks: false,
      },
      sitemap: {
        enabled: true,
        host: "https://stanza.tools",
      },
    }),
    rsc(),
    react(),
  ]),
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
    alias: {
      tslib: "tslib/tslib.es6.mjs",
    },
  },
  ssr: {
    external: ["@takumi-rs/image-response", "@vercel/functions"],
  },
  run: {
    tasks: {
      "compile-registry": {
        cwd: "../..",
        command: "jiti scripts/compile-registry.ts apps/web/.registry",
        input: [
          { pattern: "registry/modules/**", base: "workspace" },
          { pattern: "packages/schema/**", base: "workspace" },
          { pattern: "scripts/compile-registry.ts", base: "workspace" },
        ],
        output: [{ pattern: ".registry/**", base: "package" }],
      },
    },
  },
  optimizeDeps: {
    include: [
      "@base-ui/react/button",
      "@base-ui/react/checkbox",
      "@base-ui/react/dialog",
      "@base-ui/react/input",
      "@base-ui/react/menu",
      "@base-ui/react/popover",
      "@base-ui/react/scroll-area",
      "@base-ui/react/separator",
      "@base-ui/react/tabs",
      "@base-ui/react/toggle",
      "@base-ui/react/toggle-group",
      "@base-ui/react/tooltip",
      "@base-ui/react/merge-props",
      "@base-ui/react/use-render",
      "recharts",
    ],
  },
});
