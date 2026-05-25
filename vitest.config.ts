import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // Threshold ciblé uniquement sur le helper scoring — pas sur tout le
      // projet (les 45 fichiers de tests existants ne couvrent pas 100%
      // partout, le threshold global casserait la suite).
      include: ["src/lib/services/questionnaire-scoring.ts"],
      thresholds: {
        "src/lib/services/questionnaire-scoring.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
