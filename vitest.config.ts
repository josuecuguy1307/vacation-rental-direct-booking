import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Alias '@' → ./src (mismo path mapping que tsconfig.json) para que los tests
// puedan importar módulos que usan '@/lib/...'. fileURLToPath maneja bien el
// espacio en la ruta del repo.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
