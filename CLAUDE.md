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
| openai | OPENAI_API_KEY | gpt-image-2 | gpt-4.1-nano |
| openrouter | OPENROUTER_API_KEY | 7 models (GPT-5.4 Image 2, Seedream 4.5, Nano Banana Pro, Recraft v4.1 Pro, Flux 2 Max, Riverflow v2 Pro, Grok Imagine) | openai/gpt-4.1-nano |

All API logic lives in `server.ts` — no separate files or configs needed.
New models are added as entries in `availableModels[]` in the OpenRouter config block.

## Endpoints

- `POST /generate` — multipart/form-data: images[], prompt, model — returns `{ image: "data:image/...;base64,..." }`
- `POST /describe` — multipart/form-data: image, language — returns `{ name, description }`
- `POST /translate` — JSON: text, language — returns `{ translated }`. Text in double quotes `"..."` is never translated.

## Translate & Language

The UI has a Translate button, a language combobox (editable, default "English"), and a help icon (?).
- Translate sends the prompt to gpt-4.1-nano for translation, preserving `"..."` content verbatim
- Changing language re-describes all uploaded images in the new language
- `buildInjectedPrompt(userPrompt, lang)` adapts the image context template (English/Polish)

## Testing

```bash
# With OpenRouter
AI_PROVIDER=openrouter OPENROUTER_API_KEY="***" bunx playwright test

# With OpenAI
AI_PROVIDER=openai OPENAI_API_KEY="***" bunx playwright test
```

## ImageModelConfig type (for adding new models)

```typescript
type ImageModelConfig = {
  id: string;
  label: string;
  model: string;        // actual model name for the API
  apiType: "openai-images" | "openrouter-chat";
  modalities?: string[];  // ["image","text"] or ["image"]
  imageConfig?: Record<string, any>;  // extra body fields (e.g. riverflow font_inputs)
};
```

Modalities = ["image"] → response in `message.images[]` (Flux, Seedream style).
Modalities = ["image", "text"] → image in content (GPT-5.4 Image 2, Nano Banana style).
