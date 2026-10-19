import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest setup for HiTab. Currently anchored on pure-helper unit tests
 * (`lib/home-data`, `lib/folder-layout`, etc.). The `jsdom` env is wired
 * in so we can add React-component tests later without re-configuring.
 *
 * Note: we deliberately don't pull in `@vitejs/plugin-react` here — vitest
 * 3 + Vite 8 (rolldown) don't share plugin types cleanly with vitest's
 * bundled vite (rollup). Adding it later for component tests will need a
 * type workaround; for now esbuild handles `.tsx` perfectly for our pure
 * helpers.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Mirror `tsconfig.json`'s `"paths": { "@/*": ["./*"] }` so test
      // imports match what app code uses.
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["lib/**/*.test.{ts,tsx}", "components/**/*.test.{ts,tsx}"],
    // Skip the dependency-installed `node_modules`, build output, etc.
    exclude: [
      "**/node_modules/**",
      "dist/**",
      ".next/**",
      "examples/**",
    ],
    globals: false,
  },
});
