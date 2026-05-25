# text-to-image-gate

export BUN_INSTALL="${HOME}/.bun"
export PATH="${BUN_INSTALL}/bin:${PATH}"

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Providers

The server supports two AI providers: `openai` (default) and `openrouter`.
Set `AI_PROVIDER=openrouter` to use OpenRouter. Each provider has its own API key env var.

| Provider | API Key | Image Model | Describe Model |
|---|---|---|---|
| openai | OPENAI_API_KEY | gpt-image-2 | gpt-4.1-nano |
| openrouter | OPENROUTER_API_KEY | openai/gpt-5.4-image-2 | openai/gpt-4.1-nano |

All API logic lives in `server.ts` — no separate files or configs needed.

## Testing

```bash
# Run tests with OpenAI
OPENAI_API_KEY="sk-..." bunx playwright test

# Run tests with OpenRouter
AI_PROVIDER=openrouter OPENROUTER_API_KEY="sk-..." bunx playwright test
```
