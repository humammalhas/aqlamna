import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /(site|responsive|install).spec.ts/,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8765",
  },
  webServer: {
    command: "node tests/server.mjs",
    cwd: ".",
    url: "http://localhost:8765",
    reuseExistingServer: true,
    timeout: 15000,
  },
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
