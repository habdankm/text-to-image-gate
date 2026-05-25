import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const aiProvider = process.env.AI_PROVIDER || "openrouter";
const orKey = process.env.OPENROUTER_API_KEY || "";
const oaiKey = process.env.OPENAI_API_KEY || "";

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
    command: `bash -c 'export BUN_INSTALL="$HOME/.bun" && export PATH="$BUN_INSTALL/bin:$PATH" && AI_PROVIDER="${aiProvider}" OPENROUTER_API_KEY="${orKey}" OPENAI_API_KEY="${oaiKey}" cd "${__dirname}" && bun server.ts'`,
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30_000,
    cwd: __dirname,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
