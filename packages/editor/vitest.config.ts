import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: ["tests/visual.spec.ts", "tests/deploy.spec.ts", "tests/downscale.spec.ts", "node_modules"],
  },
});
