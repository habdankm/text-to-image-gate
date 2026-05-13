# Image Generator — Bun + OpenAI

Generate images using OpenAI's **gpt-image-2** model. Upload reference images, get them automatically described by **gpt-4.1-nano**, then send a prompt to generate a new combined image.

---

## Features

- **Auto-description** — each uploaded image is automatically named and described by AI (gpt-4.1-nano)
- **Iterative generation** — every generated image is auto-described and added to the file list, so you can keep refining
- **Session save/load** — export your entire workspace (images, names, descriptions, prompt) to a JSON file and reload later
- **Live prompt preview** — see the full injected prompt update in real-time as you add files or edit descriptions

## Requirements

- **Bun** 1.3.13+ ([install bun.sh](https://bun.sh))
- **OpenAI API key** with access to `gpt-image-2` and `gpt-4.1-nano` (set as `OPENAI_API_KEY` environment variable)

## Setup

```bash
git clone <repo-url>
cd <repo-directory>

# Install dependencies
bun install

# Make sure your API key is set:
export OPENAI_API_KEY="sk-..."
```

## Usage

### Start the server

```bash
bun server.ts
```

Opens at **http://localhost:3000** (override with `PORT` environment variable).

### From the browser

```
┌── Left panel ───────────────┐  ┌── Right panel ────────────┐
│  Prompt textarea (5 lines)  │  │  Drop zone                 │
│  [Save] [Copy] [Send] [New] │  │  Card 1  [X]              │
│                             │  │  Card 2  [X]              │
│  Generated image            │  │  Full prompt preview      │
│                             │  │  [Save Session] [Load]    │
└─────────────────────────────┘  │  Status                   │
                                 └───────────────────────────┘
```

1. Open http://localhost:3000
2. Drop images onto the dashed zone (or click to browse)
3. Wait for each image to be auto-described (spinner → name appears)
4. Optionally click on a name or description to edit it
5. Type your prompt in the textarea on the left
6. Click **Send** — the generated image appears on the left, and is automatically described and added as a new card on the right
7. Remove old cards with the **X** button, tweak the prompt, and click Send again to iterate
8. Click **Save** or **Copy** to export the generated image
9. Click **Save Session** to export everything to a `.json` file
10. Click **Load Session** to restore a previous session

### From the command line (curl)

```bash
# Generate an image
curl -s \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.png" \
  -F "prompt=Combine these into a scene" \
  http://localhost:3000/generate

# Describe an image
curl -s -F "image=@photo.jpg" http://localhost:3000/describe
```

---

## API

### `POST /generate`

Accepts `multipart/form-data`:

| Field | Type | Description |
|-------|------|-------------|
| `images` | file(s) | One or more image files (JPEG, PNG, etc.) |
| `prompt` | text | Description of the desired output image |

**Response:** `{ "image": "data:image/png;base64,..." }`

**Errors:**
- `400` — missing images field
- `500` — `OPENAI_API_KEY` not set
- `502` — OpenAI API error or no image returned

### `POST /describe`

Accepts `multipart/form-data` with a single `image` file. Returns `{ "name", "description" }` from gpt-4.1-nano.

---

## Testing

Tests use **Playwright** (installed via `@playwright/test`).

### Run all tests

```bash
npx playwright test
```

This starts the Bun server automatically (or reuses one already running on port 3000).

### What's tested (10 tests)

- **API:** sends two images + prompt → receives base64 PNG ✓
- **API:** returns 400 when no files sent ✓
- **Describe:** red circle description contains "circle" ✓
- **Describe:** blue triangle description contains "triangle" ✓
- **UI:** file picker upload shows 2 cards with descriptions ✓
- **UI:** error message when sending without files ✓
- **UI:** New button clears files, prompt, and output ✓
- **UI:** full flow — upload → Send → see image → New ✓
- **UI:** prompt preview updates when files are added ✓
- **Session:** save and load session preserves images without re-describing ✓

### Individual test runs

```bash
# Only API generation tests
npx playwright test --grep "POST /generate"

# Only describe endpoint tests
npx playwright test --grep "Describe endpoint"

# Only UI tests
npx playwright test --grep "UI upload"

# Only session tests
npx playwright test --grep "Session"

# See the browser
npx playwright test --headed

# Step through
npx playwright test --debug
```

---

## Project structure

```
.
├── server.ts              — single-file Bun HTTP server (the whole backend + frontend)
├── playwright.config.ts   — Playwright test configuration
├── package.json           — dependencies (@playwright/test, bun-types)
├── bun.lock               — lockfile
├── LICENSE                — MIT license
├── tests/
│   └── image-gen.spec.ts  — Playwright test suite (10 tests)
├── red_circle.jpg         — generic test image (512×512, red circle)
├── blue_triangle.jpg      — generic test image (512×512, blue triangle)
├── green_square.jpg       — generic test image (512×512, green square)
├── .gitignore
├── CLAUDE.md
├── tsconfig.json
└── README.md              — this file
```

## Notes

- **gpt-image-2** generates the final image. Also compatible: `gpt-image-1`, `gpt-image-1.5`.
- **gpt-4.1-nano** describes uploaded images (~0.9s per image, cheapest model).
- The backend forwards uploaded files as multipart `image[]` fields to `POST /v1/images/edits`.
- No API keys or secrets are stored in the repository — always use environment variables.
- Session files are self-contained (images embedded as base64), no external file references.
- Test images are generated programmatically (Pillow) — predictable shapes for reproducible test results.
