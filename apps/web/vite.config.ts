import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    mdx(),
    nitro({ serverAssets: [{ baseName: "registry", dir: "public/registry" }] }),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
