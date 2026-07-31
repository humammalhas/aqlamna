import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Playwright specs live in the same folder and must be kept out of vitest —
    // it collects them, hits `test.describe()` from @playwright/test and dies
    // with "Playwright Test did not expect test.describe() to be called here".
    // This list is the mirror of playwright.config.ts's `testMatch`; adding a
    // browser spec to one without the other breaks `npm test`.
    exclude: [
      "tests/visual.spec.ts",
      "tests/bookmark-visual.spec.ts",
      "tests/deploy.spec.ts",
      "tests/downscale.spec.ts",
      "node_modules",
    ],
  },
});
