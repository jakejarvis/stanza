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
    nitro({
      serverAssets: [
        {
          baseName: "registry",
          dir: "public/registry",
        },
      ],
    }),
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
        command: "jiti scripts/compile-registry.ts apps/web/public/registry",
        input: [{ pattern: "registry/modules/**", base: "workspace" }],
        output: [{ pattern: "public/registry/**", base: "package" }],
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
