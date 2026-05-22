import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["./src/bin.ts", "./src/index.ts"],
    format: "esm",
    target: "node22",
    platform: "node",
    deps: { alwaysBundle: [/^@stanza\//] },
    dts: true,
    clean: true,
  },
});
