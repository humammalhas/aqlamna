import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "images-playwright.spec.ts",
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        headless: true,
      },
    },
  ],
});
