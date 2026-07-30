import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /(visual|deploy)\.spec\.ts/,
  use: {
    baseURL: "http://localhost:5173",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  webServer: {
    command: "npx vite",
    cwd: ".",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30000,
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
