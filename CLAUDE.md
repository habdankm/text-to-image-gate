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

| Provider | API Key | Image Models | Describe Model |
|---|---|---|---|
| openai | OPENAI_API_KEY | gpt-image-2 (sizes: 1024x1024, 1536x1024, 1024x1536, 2048x2048, 2048x1152; qualities: low/medium/high) | gpt-4.1-nano |
| openrouter | OPENROUTER_API_KEY | 7 models (GPT-5.4 Image 2, Seedream 4.5, Nano Banana Pro, Recraft v4.1 Pro, Flux 2 Max, Riverflow v2 Pro, Grok Imagine) | openai/gpt-4.1-nano |

All API logic lives in `server.ts` — no separate files or configs needed.

## Endpoints

- `GET /models` — returns all model configs (source of truth): sizes, qualities, defaults
- `POST /generate` — multipart/form-data: images[], prompt, model, size, quality — returns `{ image: "data:image/...;base64,..." }`
- `POST /describe` — multipart/form-data: image, language — returns `{ name, description }`
- `POST /translate` — JSON: text, language — returns `{ translated }`. Text in double quotes `"..."` is never translated.

## Architecture: Model Configs

Model definitions in `CFG.availableModels[]` (getConfig function) are the **single source of truth**. The frontend loads them via `GET /models` at startup — no duplicated data.

```typescript
type ImageModelConfig = {
  id: string;        // model identifier sent from frontend
  label: string;     // display label in combobox
  model: string;     // actual model name for the API
  apiType: "openai-images" | "openrouter-chat";
  modalities?: string[];  // ["image","text"] or ["image"]
  imageConfig?: Record<string, any>;  // extra body fields (e.g. riverflow font_inputs)
  sizes?: string[];  // available sizes like "1:1-1024x1024", "16:9-1536x1024"
  defaultSize?: string;
  qualities?: string[];  // ["low", "medium", "high"]
  defaultQuality?: string;
};
```

## Translate & Language

The UI has a Translate button, a language combobox (editable, default "English"), and a help icon (?).
- Translate sends the prompt to gpt-4.1-nano for translation, preserving `"..."` content verbatim
- Changing language re-describes all uploaded images in the new language
- `buildInjectedPrompt(userPrompt, lang)` adapts the image context template (English/Polish)

## Testing

```bash
# With OpenAI
AI_PROVIDER=openai OPENAI_API_KEY="***" bunx playwright test

# With OpenRouter
AI_PROVIDER=openrouter OPENROUTER_API_KEY="***" bunx playwright test
```

Tests wait for `/models` to load before interacting with UI.
