import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [nitro(), devtools(), tailwindcss(), tanstackStart(), react()],
  resolve: {
    tsconfigPaths: true,
  },
  // `serverDir: "./server"` opts Nitro into scanning `./server/routes/` (and
  // `api/`, `middleware/`, `utils/`, etc) for filesystem-routed handlers. This
  // is how the `/og/$slot/$id` and `/sitemap.xml` endpoints get registered.
  nitro: {
    serverDir: "./server",
  },
});
