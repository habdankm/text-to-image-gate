// ===============================================================
// server.ts — Image Generator with multi-provider & multi-model support
// Providers: openai (default) | openrouter
// ===============================================================

// ----- Configuration -----
let PROVIDER = "openrouter";
try {
  const configPath = import.meta.dir + "/server.json";
  const { existsSync, readFileSync } = require("fs");
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.AI_PROVIDER && typeof config.AI_PROVIDER === "string") {
      PROVIDER = config.AI_PROVIDER.toLowerCase();
    }
  }
} catch (_) {}

const IS_OPENROUTER = PROVIDER === "openrouter";

type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
  describeModel: string;   // for /v1/chat/completions (vision)
  title: string;
  availableModels: ImageModelConfig[];
};

type ImageModelConfig = {
  id: string;        // model identifier sent from frontend
  label: string;     // display label in combobox
  model: string;     // actual model name for the API
  apiType: "openai-images" | "openrouter-chat";
  modalities?: string[];  // only for openrouter-chat: ["image","text"] or ["image"]
  imageConfig?: Record<string, any>;  // extra body fields for specific models (e.g. riverflow font_inputs)
};

function getConfig(): ProviderConfig {
  if (IS_OPENROUTER) {
    return {
      apiKey: process.env.OPENROUTER_API_KEY || "",
      baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      describeModel: "openai/gpt-4.1-nano",
      title: "Image Generator",
      availableModels: [
        { id: "gpt-image-2",      label: "GPT-5.4 Image 2",  model: "openai/gpt-5.4-image-2",       apiType: "openrouter-chat", modalities: ["image", "text"] },
        { id: "seedream-4.5",     label: "Seedream 4.5",     model: "bytedance-seed/seedream-4.5",  apiType: "openrouter-chat", modalities: ["image"] },
        { id: "gemini-3-pro-image", label: "Nano Banana Pro",  model: "google/gemini-3-pro-image-preview", apiType: "openrouter-chat", modalities: ["image", "text"] },
        { id: "recraft-v4.1-pro", label: "Recraft v4.1 Pro",  model: "recraft/recraft-v4.1-pro",      apiType: "openrouter-chat", modalities: ["image"] },
        { id: "flux-2-max",       label: "Flux 2 Max",        model: "black-forest-labs/flux.2-max", apiType: "openrouter-chat", modalities: ["image"] },
        { id: "riverflow-v2-pro", label: "Riverflow v2 Pro",   model: "sourceful/riverflow-v2-pro",   apiType: "openrouter-chat", modalities: ["image"] },
        { id: "grok-imagine",     label: "Grok Imagine",       model: "x-ai/grok-imagine-image-quality", apiType: "openrouter-chat", modalities: ["image"] },
      ],
    };
  }
  return {
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: "https://api.openai.com/v1",
    describeModel: "gpt-4.1-nano",
    title: "Image Generator",
    availableModels: [
      { id: "gpt-image-2", label: "GPT-5.4 Image 2", model: "gpt-image-2", apiType: "openai-images" },
    ],
  };
}

const CFG = getConfig();

// Resolve a model config by id (fallback to first available)
function resolveModel(modelId: string | null): ImageModelConfig {
  if (modelId) {
    const found = CFG.availableModels.find(m => m.id === modelId);
    if (found) return found;
  }
  return CFG.availableModels[0];
}

// ----- Helpers -----
function makeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${CFG.apiKey}`,
    ...extra,
  };
  if (IS_OPENROUTER) {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = CFG.title;
  }
  return headers;
}

// Convert File to base64 data URI
async function fileToDataUri(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  return `data:${file.type};base64,${b64}`;
}

// ----- Provider: Describe an image (vision) -----
async function describeImage(imageFile: File, language: string = "English"): Promise<{ name: string; description: string }> {
  const dataUri = await fileToDataUri(imageFile);

  const sysPrompt = `Describe this image in two short sentences in ${language}. Give it a short name (3 words) that best fits what it is. Return JSON: {"name":"...","description":"..."}`;

  const descRes = await fetch(`${CFG.baseUrl}/chat/completions`, {
    method: "POST",
    headers: makeHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      model: CFG.describeModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: sysPrompt },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!descRes.ok) {
    const errBody = await descRes.text();
    throw new Error(`Describe API error: ${errBody}`);
  }

  const descData = await descRes.json() as any;
  let name = "Unknown";
  let description = "(failed to describe)";
  try {
    const parsed = JSON.parse(descData.choices?.[0]?.message?.content || "{}");
    name = parsed.name || name;
    description = parsed.description || description;
  } catch (_) {}

  return { name, description };
}

// ----- Provider: Generate image -----
async function generateImage(
  prompt: string,
  images: File[],
  modelConfig: ImageModelConfig
): Promise<string> {
  if (modelConfig.apiType === "openai-images") {
    return generateImageOpenAI(prompt, images, modelConfig.model);
  }
  // openrouter-chat
  return generateImageOpenRouter(prompt, images, modelConfig.model, modelConfig.modalities, modelConfig.imageConfig);
}

async function generateImageOpenAI(
  prompt: string,
  images: File[],
  model: string
): Promise<string> {
  let openaiRes: Response;

  if (images.length === 0) {
    openaiRes = await fetch(`https://api.openai.com/v1/images/generations`, {
      method: "POST",
      headers: makeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
      }),
    });
  } else {
    const form = new FormData();
    for (const f of images) form.append("image[]", f);
    form.append("prompt", prompt);
    form.append("model", model);

    openaiRes = await fetch(`https://api.openai.com/v1/images/edits`, {
      method: "POST",
      headers: makeHeaders({ Accept: "application/json" }),
      body: form,
    });
  }

  if (!openaiRes.ok) {
    const errBody = await openaiRes.text().catch(() => "(failed to read)");
    throw new Error(`API error: ${errBody}`);
  }

  const openaiData = await openaiRes.json() as any;
  const b64 = openaiData.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error("No image in API response");
  }

  return `data:image/png;base64,${b64}`;
}

async function generateImageOpenRouter(
  prompt: string,
  images: File[],
  model: string,
  modalities?: string[],
  imageConfig?: Record<string, any>
): Promise<string> {
  const messages: any[] = [];

  if (images.length > 0) {
    const parts: any[] = [];

    parts.push({
      type: "text",
      text: prompt,
    });

    for (const f of images) {
      const buf = await f.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      parts.push({
        type: "image_url",
        image_url: { url: `data:${f.type};base64,${b64}` },
      });
    }

    messages.push({ role: "user", content: parts });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const body: Record<string, any> = {
    model,
    messages,
    modalities: modalities || ["image", "text"],
  };

  if (imageConfig) {
    body.image_config = imageConfig;
  }

  const res = await fetch(`${CFG.baseUrl}/chat/completions`, {
    method: "POST",
    headers: makeHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "(failed to read)");
    throw new Error(`API error: ${errBody}`);
  }

  const data = await res.json() as any;
  const imagesList = data.choices?.[0]?.message?.images;

  if (!imagesList || imagesList.length === 0) {
    throw new Error("No image in API response");
  }

  return imagesList[0].image_url.url;
}

// ===============================================================
// Build model options for the HTML select
// ===============================================================
function buildModelOptions(): string {
  return CFG.availableModels.map((m, i) => {
    const selected = i === 0 ? " selected" : "";
    return `<option value="${m.id}"${selected}>${m.label}</option>`;
  }).join("");
}

const MODEL_OPTIONS = buildModelOptions();

// ===============================================================
// HTML frontend
// ===============================================================

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Image Generator</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0f0f13;
    color: #e0e0e0;
    min-height: 100vh;
    padding: 2rem;
    display: flex;
    justify-content: center;
  }

  /* Two-column grid */
  .container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    max-width: 1100px;
    width: 100%;
    align-items: start;
  }
  @media (max-width: 768px) {
    .container { grid-template-columns: 1fr; }
    body { padding: 1rem; }
  }

  /* Header row: title + model select */
  .header-row {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .header-row h1 {
    font-size: 1.6rem;
    font-weight: 600;
    color: #f0f0f0;
    margin: 0;
  }
  .header-row select {
    background: #1a1a24;
    color: #e0e0e0;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    padding: 0.4rem 0.7rem;
    font-size: 0.85rem;
    font-family: inherit;
    cursor: pointer;
    outline: none;
    transition: border-color 0.2s;
  }
  .header-row select:focus { border-color: #6c8cff; }
  .header-row select option { background: #1a1a24; color: #e0e0e0; }

  /* Language input + translate */
  #langInput {
    background: #1a1a24; color: #e0e0e0; border: 1px solid #2a2a3a; border-radius: 8px;
    padding: 0.4rem 0.7rem; font-size: 0.85rem; font-family: inherit;
    outline: none; width: 100px; transition: border-color 0.2s;
  }
  #langInput:focus { border-color: #6c8cff; }
  #translateBtn { background: #3a5a2a; color: #cfc; padding: 0.4rem 0.8rem; font-size: 0.8rem; }
  #translateBtn:hover { background: #4a7a3a; }
  #helpIcon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 50%;
    background: #2a2a3a; color: #888; font-size: 0.8rem; font-weight: 700;
    cursor: help; transition: background 0.2s;
  }
  #helpIcon:hover { background: #3a3a4a; color: #ccc; }

  /* Left panel */
  #leftPanel { display: flex; flex-direction: column; gap: 0.75rem; }

  /* Right panel */
  #rightPanel { display: flex; flex-direction: column; gap: 0.75rem; }

  /* Prompt textarea */
  #promptInput {
    width: 100%; padding: 0.7rem 0.9rem; border-radius: 8px; border: 1px solid #2a2a3a;
    background: #1a1a24; color: #e0e0e0; font-size: 0.95rem; outline: none;
    resize: vertical; font-family: inherit; line-height: 1.4;
    transition: border-color 0.2s;
  }
  #promptInput:focus { border-color: #6c8cff; }
  #promptInput::placeholder { color: #555; }

  /* Button row */
  .button-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  button {
    padding: 0.5rem 1rem; border: none; border-radius: 8px;
    font-size: 0.9rem; font-weight: 500; cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
  }
  #sendBtn { background: #4a6cf7; color: #fff; flex: 1; min-width: 60px; }
  #sendBtn:hover { background: #5a7cff; }
  #sendBtn:disabled { opacity: 0.4; cursor: default; }
  #newBtn, #saveBtn, #copyBtn { background: #2a2a3a; color: #ccc; }
  #newBtn:hover, #saveBtn:hover, #copyBtn:hover { background: #3a3a4a; }

  /* Output image */
  #output { display: none; }
  #output.show { display: block; }
  #output img { max-width: 100%; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.4); }

  /* Drop zone */
  #dropZone {
    border: 2px dashed #3a3a4a; border-radius: 10px; padding: 1rem 0.8rem;
    text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s;
    background: #1a1a24;
  }
  #dropZone.drag-over { border-color: #6c8cff; background: #1e2240; }
  #dropZone p { color: #888; font-size: 0.85rem; }
  #dropZone .icon { font-size: 1.5rem; display: block; margin-bottom: 0.2rem; }

  /* Cards — stacked vertically */
  .file-card {
    display: flex; gap: 0.6rem; align-items: flex-start;
    background: #1a1a24; border: 1px solid #2a2a3a; border-radius: 10px;
    padding: 0.6rem; position: relative;
  }
  .file-card .thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
  .file-card .info { flex: 1; min-width: 0; }
  .file-card .name { font-size: 0.85rem; font-weight: 600; color: #ddd; margin-bottom: 0.15rem; outline: none; cursor: text; }
  .file-card .desc { font-size: 0.76rem; color: #888; margin-bottom: 0.2rem; outline: none; cursor: text; }
  .file-card .desc:empty::before { content: 'Click to edit description'; color: #555; }
  .status-badge { font-size: 0.7rem; color: #888; padding: 0.15rem 0.4rem; border-radius: 4px; display: inline-block; background: #2a2a3a; }
  .status-badge.done { background: #1a4a2a; color: #8f8; }
  .status-badge.failed { background: #4a1a1a; color: #f88; }
  .remove-btn {
    position: absolute; top: 4px; right: 4px;
    background: #4a1a1a; color: #f88; border: none; border-radius: 4px;
    font-size: 0.75rem; padding: 0.15rem 0.4rem; cursor: pointer; display: none;
  }
  .file-card:hover .remove-btn { display: block; }

  /* Prompt preview */
  #promptPreview { display: none; }
  #promptPreview.show { display: block; background: #1a1a24; border: 1px solid #2a2a3a; border-radius: 8px; padding: 0.6rem; max-height: 200px; overflow-y: auto; }
  .preview-label { font-size: 0.75rem; color: #6c8cff; margin-bottom: 0.3rem; font-weight: 500; }
  #promptPreviewContent { font-size: 0.78rem; color: #aaa; white-space: pre-wrap; word-break: break-word; }

  /* Status */
  #status { font-size: 0.85rem; min-height: 1.2em; padding: 0.2rem 0; }
  #status.error { color: #f88; }

  /* Session buttons */
  .session-buttons { display: flex; gap: 0.5rem; }
  .session-buttons button { flex: 1; background: #2a2a3a; color: #ccc; font-size: 0.8rem; padding: 0.4rem 0.5rem; }
  .session-buttons button:hover { background: #3a3a4a; }

  /* Spinner */
  .spinner {
    display: inline-block; width: 14px; height: 14px;
    border: 2px solid #444; border-top-color: #6c8cff; border-radius: 50%;
    animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 5px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  #filePicker { display: none; }
  #loadSessionInput { display: none; }
</style>
</head>
<body>
<div class="container">

  <div class="header-row">
    <h1>Image Generator</h1>
    <select id="modelSelect">${MODEL_OPTIONS}</select>
    <button id="translateBtn">Translate</button>
    <input list="langList" id="langInput" value="English" placeholder="Language...">
    <datalist id="langList">
      <option value="English">
      <option value="Polish">
    </datalist>
    <span id="helpIcon" title="Prompt will be translated to the target language before sending to the image model. Text inside double quotes &quot;...&quot; will NOT be translated — those are image references.">?</span>
  </div>

  <div id="leftPanel">
    <textarea id="promptInput" rows="5" placeholder="Describe the image you want to generate..."></textarea>
    <div class="button-row">
      <button id="saveBtn">Save</button>
      <button id="copyBtn">Copy</button>
      <button id="sendBtn">Send</button>
      <button id="newBtn">New</button>
    </div>
    <div id="output">
      <img id="outputImg" alt="Generated image">
    </div>
  </div>

  <div id="rightPanel">
    <div id="dropZone">
      <span class="icon">&#128247;</span>
      <p>Drop images here or click to browse</p>
    </div>
    <input type="file" id="filePicker" multiple accept="image/*">

    <div id="cardRow"></div>

    <div id="promptPreview">
      <div class="preview-label">Full prompt to be sent:</div>
      <pre id="promptPreviewContent"></pre>
    </div>

    <div class="session-buttons">
      <button id="saveSessionBtn">Save Session</button>
      <button id="loadSessionBtn">Load Session</button>
      <input type="file" id="loadSessionInput" accept=".json">
    </div>

    <div id="status"></div>
  </div>
</div>

<script>
(function() {
  var files = [];
  var nextId = 0;

  // DOM refs
  var dropZone    = document.getElementById('dropZone');
  var filePicker  = document.getElementById('filePicker');
  var cardRow     = document.getElementById('cardRow');
  var promptInput = document.getElementById('promptInput');
  var sendBtn     = document.getElementById('sendBtn');
  var modelSelect = document.getElementById('modelSelect');
  var newBtn      = document.getElementById('newBtn');
  var statusEl    = document.getElementById('status');
  var outputDiv   = document.getElementById('output');
  var outputImg   = document.getElementById('outputImg');
  var saveBtn     = document.getElementById('saveBtn');
  var copyBtn     = document.getElementById('copyBtn');
  var saveSessionBtn = document.getElementById('saveSessionBtn');
  var loadSessionBtn = document.getElementById('loadSessionBtn');
  var loadSessionInput = document.getElementById('loadSessionInput');
  var previewDiv      = document.getElementById('promptPreview');
  var previewContent  = document.getElementById('promptPreviewContent');
  var translateBtn    = document.getElementById('translateBtn');
  var langInput       = document.getElementById('langInput');

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = isError ? 'error' : '';
  }

  function showLoading(msg) {
    statusEl.innerHTML = '<span class="spinner"></span>' + msg;
    statusEl.className = '';
  }

  // Build the injected prompt
  function buildInjectedPrompt(userPrompt, lang) {
    if (files.length === 0) return userPrompt;
    lang = lang || 'English';
    var descriptions = files.map(function(e) {
      return '- ' + (e.name || 'Unknown image') + ': ' + (e.description || '') + ' (file: ' + e.file.name + ')';
    }).join(String.fromCharCode(10));

    if (lang.toLowerCase() === 'english') {
      return 'I have uploaded multiple images. Here is what each contains:' + String.fromCharCode(10) + descriptions + String.fromCharCode(10) + String.fromCharCode(10) + 'Now, using these images as references, ' + userPrompt;
    }
    return 'Przesłałem wiele obrazków. Oto co każdy zawiera:' + String.fromCharCode(10) + descriptions + String.fromCharCode(10) + String.fromCharCode(10) + 'Teraz, używając tych obrazków jako odniesienia, ' + userPrompt;
  }

  // Update prompt preview
  function updatePreview() {
    var p = promptInput.value.trim() || 'Generate an image';
    var lang = document.getElementById('langInput').value || 'English';
    if (files.length > 0) {
      previewContent.textContent = buildInjectedPrompt(p, lang);
    } else {
      previewContent.textContent = p;
    }
    previewDiv.classList.add('show');
  }

  // Create a card element for a file entry
  function createCard(entry) {
    var card = document.createElement('div');
    card.className = 'file-card';
    card.dataset.id = entry.id;

    var img = document.createElement('img');
    img.className = 'thumb';
    img.src = URL.createObjectURL(entry.file);
    img.alt = entry.file.name;

    var info = document.createElement('div');
    info.className = 'info';

    var nameLine = document.createElement('div');
    nameLine.className = 'name';
    nameLine.textContent = '...';

    var descLine = document.createElement('div');
    descLine.className = 'desc';
    descLine.textContent = '';

    var badge = document.createElement('div');
    badge.className = 'status-badge';
    badge.innerHTML = '<span class="spinner"></span> Describing...';

    info.appendChild(nameLine);
    info.appendChild(descLine);
    info.appendChild(badge);
    card.appendChild(img);
    card.appendChild(info);

    // X remove button
    var removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'X';
    removeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      removeEntry(entry.id);
    });
    card.appendChild(removeBtn);

    entry._nameLine = nameLine;
    entry._descLine = descLine;
    entry._badge = badge;
    entry._card = card;

    return card;
  }

  // Update a card with name + description
  function updateCard(entry) {
    entry._nameLine.textContent = entry.name || 'Unknown';
    entry._descLine.textContent = entry.description || '';
    entry._badge.className = 'status-badge done';
    entry._badge.textContent = 'Ready';
    makeEditable(entry);
    updatePreview();
  }

  // Mark card as failed
  function failCard(entry) {
    entry._nameLine.textContent = 'Unknown';
    entry._descLine.textContent = '(failed to describe)';
    entry._badge.className = 'status-badge failed';
    entry._badge.textContent = 'Failed';
    makeEditable(entry);
    updatePreview();
  }

  // Make name/description editable inline
  function makeEditable(entry) {
    entry._nameLine.contentEditable = true;
    entry._descLine.contentEditable = true;

    entry._nameLine.addEventListener('blur', function() {
      entry.name = this.textContent.trim() || 'Unknown';
      updatePreview();
    });
    entry._descLine.addEventListener('blur', function() {
      entry.description = this.textContent.trim() || '';
      updatePreview();
    });
    entry._nameLine.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
    });
    entry._descLine.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
    });
  }

  // Describe a single file via backend
  async function describeFile(entry) {
    var formData = new FormData();
    formData.append('image', entry.file);
    var lang = document.getElementById('langInput').value || 'English';
    formData.append('language', lang);

    try {
      var res = await fetch('/describe', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      entry.name = data.name || 'Unknown';
      entry.description = data.description || '';
      entry.status = 'ready';
      updateCard(entry);
    } catch (err) {
      entry.name = 'Unknown';
      entry.description = '(failed to describe)';
      entry.status = 'failed';
      failCard(entry);
    }
  }

  // Add files, create cards, fire descriptions
  async function addFiles(fileList) {
    var skipped = 0;
    var oversized = 0;
    var newEntries = [];

    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      if (!f.type.startsWith('image/')) { skipped++; continue; }
      if (f.size > 20 * 1024 * 1024) { oversized++; continue; }
      var entry = { id: nextId++, file: f, name: '', description: '', status: 'describing' };
      files.push(entry);
      newEntries.push(entry);
      cardRow.appendChild(createCard(entry));
    }

    if (skipped > 0) {
      setStatus('Skipped ' + skipped + ' non-image file(s).', true);
      setTimeout(function() { if (!statusEl.className.includes('error')) setStatus(''); }, 3000);
    }
    if (oversized > 0) {
      setStatus('Skipped ' + oversized + ' file(s) over 20 MB limit.', true);
      setTimeout(function() { if (!statusEl.className.includes('error')) setStatus(''); }, 3000);
    }

    updatePreview();

    // Fire descriptions with concurrency cap of 3
    async function batchDescribe(entries, limit) {
      for (var i = 0; i < entries.length; i += limit) {
        var batch = entries.slice(i, i + limit);
        await Promise.allSettled(batch.map(function(e) { return describeFile(e); }));
      }
    }
    batchDescribe(newEntries, 3);
  }

  // Remove an entry
  function removeEntry(id) {
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) {
        var card = files[i]._card;
        if (card) {
          var imgs = card.querySelectorAll('img');
          imgs.forEach(function(img) { URL.revokeObjectURL(img.src); });
          card.remove();
        }
        files.splice(i, 1);
        break;
      }
    }
    updatePreview();
  }

  function resetUI() {
    for (var i = 0; i < files.length; i++) {
      var entry = files[i];
      if (entry._card) {
        var imgs = entry._card.querySelectorAll('img');
        imgs.forEach(function(img) { URL.revokeObjectURL(img.src); });
      }
    }
    cardRow.innerHTML = '';
    files.length = 0;
    nextId = 0;
    promptInput.value = '';
    outputDiv.classList.remove('show');
    outputImg.src = '';
    dropZone.classList.remove('drag-over');
    updatePreview();
    setStatus('');
  }

  // Convert base64 data URL to a File object
  function dataUrlToFile(dataUrl, filename) {
    var parts = dataUrl.split(',');
    var b64 = parts[1];
    var meta = parts[0];
    var mime = meta.match(/:(.*?);/)[1];
    var byteStr = atob(b64);
    var arr = new Uint8Array(byteStr.length);
    for (var i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
    return new File([arr], filename, { type: mime });
  }

  // File to base64 helper
  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  // Drop zone
  dropZone.addEventListener('click', function() { filePicker.click(); });
  dropZone.addEventListener('dragenter', function(e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });
  filePicker.addEventListener('change', function() {
    if (filePicker.files.length) addFiles(filePicker.files);
    filePicker.value = '';
  });

  // Live preview update as user types
  promptInput.addEventListener('input', updatePreview);

  // Language change → re-describe all files
  langInput.addEventListener('change', function() {
    updatePreview();
    // Re-describe files in new language
    for (var i = 0; i < files.length; i++) {
      var e = files[i];
      e.name = ''; e.description = ''; e.status = 'describing';
      if (e._badge) {
        e._badge.className = 'status-badge';
        e._badge.innerHTML = '<span class=\"spinner\"></span> Describing...';
      }
    }
    // Fire descriptions with concurrency cap of 3
    function batchDescribe(entries, limit) {
      for (var i = 0; i < entries.length; i += limit) {
        var batch = entries.slice(i, i + limit);
        Promise.allSettled(batch.map(function(e) { return describeFile(e); }));
      }
    }
    batchDescribe(files, 3);
  });

  // Translate button
  translateBtn.addEventListener('click', async function() {
    var text = promptInput.value.trim();
    if (!text) { setStatus('Nothing to translate.', true); return; }
    var lang = langInput.value || 'English';
    translateBtn.disabled = true;
    showLoading('Translating to ' + lang + '...');
    try {
      var res = await fetch('/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, language: lang }),
      });
      if (!res.ok) { throw new Error(await res.text()); }
      var data = await res.json();
      if (data.translated) { promptInput.value = data.translated; }
      setStatus('Translated to ' + lang + '.');
      updatePreview();
    } catch (err) {
      setStatus('Translate error: ' + err.message, true);
    } finally {
      translateBtn.disabled = false;
    }
  });

  // Send
  sendBtn.addEventListener('click', async function() {
    var userPrompt = promptInput.value.trim();
    if (!userPrompt && files.length === 0) {
      setStatus('Please enter a prompt or upload at least one image.', true);
      return;
    }
    userPrompt = userPrompt || 'Generate an image';
    var lang = document.getElementById('langInput').value || 'English';
    var fullPrompt = buildInjectedPrompt(userPrompt, lang);

    sendBtn.disabled = true;
    showLoading('Generating image...');

    var formData = new FormData();
    for (var i = 0; i < files.length; i++) formData.append('images', files[i].file);
    formData.append('prompt', fullPrompt);
    formData.append('model', modelSelect.value);

    try {
      var res = await fetch('/generate', { method: 'POST', body: formData });
      if (!res.ok) {
        var err = await res.text();
        var short = err.length > 200 ? err.slice(0, 200) + '...' : err;
        throw new Error(short || 'Server error');
      }
      var data = await res.json();
      if (data.image) {
        outputImg.src = data.image;
        outputDiv.classList.add('show');
        setStatus('Done! Auto-describing generated image...');

        var genFile = dataUrlToFile(data.image, 'generated-' + nextId + '.png');
        var genEntry = { id: nextId++, file: genFile, name: '', description: '', status: 'describing' };
        files.push(genEntry);
        cardRow.appendChild(createCard(genEntry));
        describeFile(genEntry);
      } else {
        throw new Error('No image in response');
      }
    } catch (err) {
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setStatus('Network error - is the server running?', true);
      } else {
        setStatus('Error: ' + err.message, true);
      }
    } finally {
      sendBtn.disabled = false;
    }
  });

  // Save
  saveBtn.addEventListener('click', function() {
    var link = document.createElement('a');
    link.href = outputImg.src;
    link.download = 'generated-image-' + Date.now() + '.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatus('Image saved!');
    setTimeout(function() { if (!statusEl.className.includes('error')) setStatus(''); }, 2000);
  });

  // Copy
  copyBtn.addEventListener('click', async function() {
    try {
      var response = await fetch(outputImg.src);
      var blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setStatus('Image copied to clipboard!');
      setTimeout(function() { if (!statusEl.className.includes('error')) setStatus(''); }, 2000);
    } catch (err) {
      setStatus('Failed to copy image: ' + err.message, true);
    }
  });

  // Save session
  saveSessionBtn.addEventListener('click', async function() {
    if (files.length === 0 && !promptInput.value.trim()) {
      setStatus('Nothing to save.', true);
      return;
    }
    setStatus('Saving session...');
    var session = { version: 1, prompt: promptInput.value, images: [] };
    for (var i = 0; i < files.length; i++) {
      var entry = files[i];
      setStatus('Saving session... converting image ' + (i + 1) + ' of ' + files.length);
      var b64 = await fileToBase64(entry.file);
      session.images.push({
        name: entry.name,
        description: entry.description,
        filename: entry.file.name,
        data: b64,
      });
    }
    var json = JSON.stringify(session, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'session-' + Date.now() + '.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Session saved!');
    setTimeout(function() { if (!statusEl.className.includes('error')) setStatus(''); }, 3000);
  });

  // Load session
  loadSessionBtn.addEventListener('click', function() { loadSessionInput.click(); });
  loadSessionInput.addEventListener('change', async function() {
    var file = this.files[0];
    if (!file) return;
    try {
      var text = await file.text();
      var session = JSON.parse(text);
      if (!session.version || !session.images) throw new Error('Invalid session file');

      resetUI();

      promptInput.value = session.prompt || '';
      for (var i = 0; i < session.images.length; i++) {
        var imgData = session.images[i];
        var fileObj = dataUrlToFile(imgData.data, imgData.filename);
        var entry = { id: nextId++, file: fileObj, name: imgData.name, description: imgData.description, status: 'ready' };
        files.push(entry);
        cardRow.appendChild(createCard(entry));
        updateCard(entry);
      }
      updatePreview();
      setStatus('Session loaded (' + session.images.length + ' images).');
    } catch (err) {
      setStatus('Failed to load session: ' + err.message, true);
    }
    this.value = '';
  });

  // New
  newBtn.addEventListener('click', resetUI);
})();
</script>
</body>
</html>`;

// ===============================================================
// HTTP Server
// ===============================================================

const server = Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(HTML, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // POST /describe
    if (url.pathname === "/describe" && req.method === "POST") {
      const contentType = req.headers.get("Content-Type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return new Response("Expected multipart/form-data", { status: 400 });
      }
      const formData = await req.formData();
      const imageFile = formData.get("image");
      const language = formData.get("language")?.toString() || "English";
      if (!imageFile || !(imageFile instanceof File) || !imageFile.type.startsWith("image/")) {
        return new Response("A single image file is required", { status: 400 });
      }

      if (!CFG.apiKey) {
        const keyName = IS_OPENROUTER ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY";
        return new Response(`${keyName} not set`, { status: 500 });
      }

      try {
        const result = await describeImage(imageFile, language);
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: any) {
        console.error("Describe error:", err.message);
        return new Response(err.message || "Internal error", { status: 502 });
      }
    }

    // POST /translate
    if (url.pathname === "/translate" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || !body.text) {
        return new Response(JSON.stringify({ error: "Missing 'text'" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const text = body.text;
      const targetLang = body.language || "English";

      if (!CFG.apiKey) {
        const keyName = IS_OPENROUTER ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY";
        return new Response(`${keyName} not set`, { status: 500 });
      }

      const translatePrompt = `Translate the following text to ${targetLang}. IMPORTANT: Never translate anything that is inside double quotes ". The content in quotes "" must stay exactly as written. Return ONLY the translated text, no commentary, no markdown formatting.

Text to translate:
${text}`;

      try {
        const res = await fetch(`${CFG.baseUrl}/chat/completions`, {
          method: "POST",
          headers: makeHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            model: CFG.describeModel,
            messages: [{ role: "user", content: translatePrompt }],
            max_tokens: 2000,
          }),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "(failed to read)");
          throw new Error(`Translate API error: ${errBody}`);
        }
        const data = await res.json() as any;
        const translated = data.choices?.[0]?.message?.content || "";
        return new Response(JSON.stringify({ translated }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: any) {
        console.error("Translate error:", err.message);
        return new Response(err.message || "Internal error", { status: 502 });
      }
    }

    // POST /generate
    if (url.pathname === "/generate" && req.method === "POST") {
      const contentType = req.headers.get("Content-Type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return new Response("Expected multipart/form-data", { status: 400 });
      }

      const formData = await req.formData();
      const prompt = formData.get("prompt")?.toString() || "";
      const modelId = formData.get("model")?.toString() || null;
      const imageFiles = formData.getAll("images").filter(
        (v) => v instanceof File
      ) as File[];

      if (!CFG.apiKey) {
        const keyName = IS_OPENROUTER ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY";
        return new Response(`${keyName} not set`, { status: 500 });
      }

      const modelConfig = resolveModel(modelId);

      try {
        const imageDataUri = await generateImage(prompt, imageFiles, modelConfig);
        return new Response(JSON.stringify({ image: imageDataUri }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: any) {
        console.error("Generate error:", err.message);
        return new Response(err.message || "Internal error", { status: 502 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
console.log(`Provider: ${PROVIDER} (model: ${CFG.availableModels[0].model}, describe: ${CFG.describeModel})`);
