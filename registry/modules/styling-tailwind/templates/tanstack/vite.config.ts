import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    // tanstackStart() must precede react() — Start transforms server functions
    // and generates the route tree first.
    tanstackStart(),
    tailwindcss(),
    react(),
  ],
});
