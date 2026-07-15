import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Sans `test.globals: true` (délibéré, voir vitest.config.ts), le cleanup automatique de
// @testing-library/react ne se déclenche pas tout seul entre les tests — chaque `render`
// s'accumulerait dans le même document jsdom et casserait les requêtes `getByText` sur des
// libellés répétés d'un test à l'autre.
afterEach(() => {
  cleanup();
});
