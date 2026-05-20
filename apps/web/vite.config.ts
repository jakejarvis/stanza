import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    // tanstackStart() MUST come before react() — the Start plugin generates
    // route trees and transforms server functions; the React plugin reads
    // the transformed output.
    tanstackStart(),
    react(),
  ],
});
