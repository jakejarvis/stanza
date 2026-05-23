import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  plugins: lazyPlugins(async () => [
    mdx(await import("./source.config.ts")),
    devtools(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        filter: ({ path }) => !path.includes("#"),
      },
    }),
    react(),
    nitro({
      serverAssets: [
        {
          baseName: "registry",
          dir: "public/registry",
        },
      ],
      vercel: {
        config: {
          version: 3,
          routes: [
            { src: "/llms.txt", dest: "/docs/llms.txt" },
            { src: "/llms-full.txt", dest: "/docs/llms-full.txt" },
          ],
        },
      },
    }),
  ]),
  resolve: {
    tsconfigPaths: true,
    alias: {
      // tslib's CJS UMD sets __esModule: true without providing a default
      // export, which breaks Vite 8 / Rolldown's consistent CJS interop.
      // Alias to the native ESM build to avoid the interop entirely.
      tslib: "tslib/tslib.es6.mjs",
    },
  },
});
