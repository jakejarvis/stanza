import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Keep Playwright's e2e specs out of the unit-test run.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
