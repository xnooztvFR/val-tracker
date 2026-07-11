import { defineConfig } from "vitest/config";

// Config dédiée aux tests (séparée de vite.config.ts, voir son commentaire) : les tests
// actuels ciblent des modules TS purs (src/lib/*.test.ts), pas de rendu React, donc pas
// besoin du plugin react ni d'un environnement DOM ici.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
