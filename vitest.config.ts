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
      // Threshold ciblé uniquement sur des helpers à valeur critique —
      // pas sur tout le projet (les fichiers de tests existants ne couvrent
      // pas 100% partout, le threshold global casserait la suite).
      include: [
        "src/lib/services/questionnaire-scoring.ts",
        "src/lib/services/load-signatures.ts",
      ],
      thresholds: {
        "src/lib/services/questionnaire-scoring.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/services/load-signatures.ts": {
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
