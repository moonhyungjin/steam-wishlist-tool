import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Locally, several Chromium processes loading the app at once stall on this Windows machine
  // (page.goto never fires "load"; one browser with many pages, or curl, is fine) - so run one at
  // a time there. CI (Linux) keeps Playwright's default.
  workers: process.env.CI ? undefined : 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 900 } },
  // Production build, not `next dev` - the perf test needs realistic numbers.
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
