// ---------------------------------------------------------------------------
// Playwright config for the editor's browser tests.
//
// TWO SUITES LIVE IN tests/, AND THEY ARE NOT THE SAME KIND OF TEST.
//
//   visual.spec.ts + bookmark-visual.spec.ts  run against a LOCAL vite dev
//   server and against the exported story on file://. They are a gate: they
//   are part of `npm test` and a red one means the code is wrong.
//
//   deploy.spec.ts  runs against https://aqlamna.org — the LIVE deployment. It
//   is red when the site is stale, when the network is down, and when someone
//   else deploys. That is a useful check and a terrible gate, so it is OFF by
//   default. Turn it on deliberately:
//
//     $env:DEPLOY_TESTS = "1"; npx playwright test --config packages/editor/playwright.config.ts
//
// Run the gate: npm run test:visual   (from the repo root, inside `npm test`)
// ---------------------------------------------------------------------------

import { defineConfig } from "@playwright/test";

const includeDeploy = process.env.DEPLOY_TESTS === "1";

export default defineConfig({
  testDir: "./tests",
  testMatch: includeDeploy
    ? /(visual|bookmark-visual|deploy)\.spec\.ts/
    : /(visual|bookmark-visual)\.spec\.ts/,
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
