# Image Generator — Bun + Multi-Provider (OpenAI / OpenRouter)

Generate images using **gpt-image-2** (OpenAI) or any of 7+ models via **OpenRouter**. Upload reference images, get them automatically described by a vision model, then send a prompt to generate a new combined image. Supports **multi-language** prompts and image descriptions.

---

## Features

- **Multi-provider** — OpenAI (default) or OpenRouter, switch via `AI_PROVIDER` env var or `server.json`
- **7+ image models** — GPT-5.4 Image 2, Seedream 4.5, Nano Banana Pro, Recraft v4.1 Pro, Flux 2 Max, Riverflow v2 Pro, Grok Imagine — all selectable from a combobox
- **Translate** — translate your prompt to any language before sending to the image model. Text inside double quotes `"..."` is never translated (those are image references)
- **Multi-language descriptions** — uploaded images are described in your chosen language
- **Auto-description** — each uploaded image is automatically named and described by AI
- **Iterative generation** — every generated image is auto-described and added to the file list, so you can keep refining
- **Session save/load** — export your entire workspace to a JSON file and reload later
- **Live prompt preview** — see the full injected prompt update in real-time

## Requirements

- **Bun** 1.3.13+
- **API key** — OpenAI (`OPENAI_API_KEY`) or OpenRouter (`OPENROUTER_API_KEY`)

## Setup

```bash
bun install
```

## Usage

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `AI_PROVIDER` | `openai` | Provider: `openai` or `openrouter` |
| `OPENAI_API_KEY` | — | Required when using OpenAI |
| `OPENROUTER_API_KEY` | — | Required when using OpenRouter |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Custom base URL (optional) |
| `PORT` | `3000` | Server port |

### Start the server

```bash
# OpenAI (default)
export OPENAI_API_KEY="***"
bun server.ts

# OpenRouter
export AI_PROVIDER=openrouter
export OPENROUTER_API_KEY="***"
bun server.ts
```

Opens at **http://localhost:3000**

### From the browser

```
┌── Header ──────────────────────────────────────────────────────┐
│  Image Generator  [model v]  [Translate]  [lang v]  [?]        │
├────────────────────────┬───────────────────────────────────────┤
│  Left panel             │  Right panel                          │
│  Prompt textarea        │  Drop zone / file cards               │
│  [Save] [Copy] [New]    │  Full prompt preview                  │
│  Generated image        │  [Save Session] [Load Session]        │
│                         │  Status                               │
└─────────────────────────┴───────────────────────────────────────┘
```

1. Open http://localhost:3000
2. Pick a model from the combobox in the header
3. Choose a language (or type your own) — default "English"
4. Click **?** for help on how Translate works
5. Drop images onto the dashed zone (or click to browse)
6. Wait for each image to be auto-described (spinner → name appears in chosen language)
7. Optionally click on a name or description to edit it
8. Type your prompt in Polish (or any language), then click **Translate** → the prompt is translated to the target language. Text in `"..."` stays untouched
9. Click **Send** — the generated image appears on the left, and is automatically described and added as a new card on the right
10. Remove old cards with the **X** button, tweak the prompt, and click Send again to iterate
11. Click **Save** or **Copy** to export the generated image
12. Click **Save Session** to export everything to a `.json` file
13. Click **Load Session** to restore a previous session

### From the command line (curl)

```bash
# Generate an image
curl -s \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.png" \
  -F "prompt=Combine these into a scene" \
  -F "model=gpt-image-2" \
  http://localhost:3000/generate

# Describe an image in Polish
curl -s -F "image=@photo.jpg" -F "language=Polish" http://localhost:3000/describe

# Translate a prompt from Polish to English
curl -s -X POST http://localhost:3000/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"smok na górze","language":"English"}'
```

---

## API

### `POST /generate`

Accepts `multipart/form-data`:

| Field | Type | Description |
|---|---|---|
| `images` | file(s) | One or more image files (JPEG, PNG, etc.) |
| `prompt` | text | Description of the desired output image |
| `model` | text | Model ID (optional, defaults to first available) |

**Response:** `{ "image": "data:image/png;base64,..." }`

**Errors:**
- `400` — missing images field
- `500` — API key not set
- `502` — upstream API error

### `POST /describe`

Accepts `multipart/form-data`:

| Field | Type | Description |
|---|---|---|
| `image` | file | A single image file |
| `language` | text | Language for the description (optional, default "English") |

Returns `{ "name", "description" }` from vision model.

### `POST /translate`

Accepts JSON body:

| Field | Type | Description |
|---|---|---|
| `text` | text | Text to translate |
| `language` | text | Target language (optional, default "English") |

Content inside double quotes `"..."` is never translated. Returns `{ "translated" }`.

---

## Models

### OpenAI (default)
- Image model: `gpt-image-2`
- Describe model: `gpt-4.1-nano`
- Endpoint: `https://api.openai.com/v1`

### OpenRouter
- Default image model: `openai/gpt-5.4-image-2`
- All 7 models selectable from the UI:
  - GPT-5.4 Image 2, Seedream 4.5, Nano Banana Pro, Recraft v4.1 Pro, Flux 2 Max, Riverflow v2 Pro, Grok Imagine
- Describe model: `openai/gpt-4.1-nano`
- Endpoint: `https://openrouter.ai/api/v1`
- OpenRouter sends `HTTP-Referer` and `X-Title` headers automatically

---

## Testing

Tests use **Playwright** and run against the live server (real API calls).

### Run all tests

```bash
# With OpenRouter
AI_PROVIDER=openrouter OPENROUTER_API_KEY="***" bunx playwright test

# With OpenAI
OPENAI_API_KEY="***" AI_PROVIDER=openai bunx playwright test
```

The server is started automatically (or reuses one on port 3000).

### What's tested (10+ tests)

- **API:** sends two images + prompt → receives base64 PNG ✓
- **API:** text-to-image (prompt only) ✓
- **Describe:** red circle description ✓
- **Describe:** blue triangle description ✓
- **UI:** file picker upload shows 2 cards with descriptions ✓
- **UI:** error message when sending without files ✓
- **UI:** New button clears files, prompt, and output ✓
- **UI:** full flow — upload → Send → see image → New ✓
- **UI:** prompt preview updates when files are added ✓
- **Session:** save and load session preserves images without re-describing ✓

---

## Project structure

```
.
├── server.ts              — single-file Bun HTTP server (backend + frontend + multi-provider)
├── playwright.config.ts   — Playwright test configuration
├── package.json           — dependencies (@playwright/test, bun-types)
├── bun.lock               — lockfile
├── LICENSE                — MIT license
├── tests/
│   └── image-gen.spec.ts  — Playwright test suite (10+ tests)
├── red_circle.jpg         — generic test image (512×512, red circle)
├── blue_triangle.jpg      — generic test image (512×512, blue triangle)
├── green_square.jpg       — generic test image (512×512, green square)
├── .gitignore
├── CLAUDE.md
├── tsconfig.json
└── README.md              — this file
```

## Notes

- No API keys or secrets are stored in the repository — always use environment variables.
- `server.json` is gitignored — use it locally to set `AI_PROVIDER` without env vars
- Session files are self-contained (images embedded as base64), no external file references.
- Test images are generated programmatically (Pillow) — predictable shapes for reproducible test results.
- When switching providers, make sure the corresponding API key is set.
- New models can be added by adding an entry to `availableModels[]` in `server.ts` — no other code changes needed.
