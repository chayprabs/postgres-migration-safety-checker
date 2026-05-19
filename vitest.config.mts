import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [
        "coverage/**",
        "node_modules/**",
        ".next/**",
        "src/**/*.test.*",
        "src/**/__tests__/**",
        "src/**/__fixtures__/**",
      ],
    },
    environment: "node",
    globals: true,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "packages/pg-migration-analyzer/__tests__/**/*.test.ts",
      "packages/pg-migration-analyzer/src/**/*.test.ts",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
