import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: `bash -c 'export BUN_INSTALL="$HOME/.bun" && export PATH="$BUN_INSTALL/bin:$PATH" && cd "${__dirname}" && bun server.ts'`,
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30_000,
    cwd: __dirname,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
