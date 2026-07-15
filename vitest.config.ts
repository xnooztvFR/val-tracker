import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Config dédiée aux tests (séparée de vite.config.ts, voir son commentaire). Environnement
// par défaut "node" pour les modules TS purs (src/lib/*.test.ts, la majorité de la suite) ;
// les tests de composants (*.test.tsx, voir src/components/*.test.tsx) surchargent
// l'environnement en "jsdom" via un docblock `// @vitest-environment jsdom` en tête de
// fichier plutôt que de forcer jsdom globalement, pour ne pas payer son coût de démarrage
// sur chaque test purement logique.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
