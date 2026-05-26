import { test, expect } from "@playwright/test";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const circlePath    = path.resolve(__dirname, "..", "red_circle.jpg");
const trianglePath  = path.resolve(__dirname, "..", "blue_triangle.jpg");
const squarePath    = path.resolve(__dirname, "..", "green_square.jpg");

function fileToBuffer(p: string): Buffer {
  return fs.readFileSync(p);
}

const BASE = "http://localhost:3000";

test.describe("POST /generate API", () => {
  test("returns an image when sending two files with a prompt", async () => {
    const form = new FormData();
    const cBuf = fileToBuffer(circlePath);
    const tBuf = fileToBuffer(trianglePath);
    form.append("images", new Blob([cBuf], { type: "image/jpeg" }), "red_circle.jpg");
    form.append("images", new Blob([tBuf], { type: "image/jpeg" }), "blue_triangle.jpg");
    form.append("prompt", "Combine these two shapes into a single scene");
    form.append("size", "1024x1024");
    form.append("quality", "low");

    const response = await fetch(`${BASE}/generate`, { method: "POST", body: form });
    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body).toHaveProperty("image");
    expect(body.image).toMatch(/^data:image\/(png|jpeg);base64,/);
  });

  test("returns an image when sending only a prompt (text-to-image)", async () => {
    const form = new FormData();
    form.append("prompt", "A serene mountain lake at sunset");
    form.append("size", "1024x1024");
    form.append("quality", "low");

    const response = await fetch(`${BASE}/generate`, { method: "POST", body: form });
    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body).toHaveProperty("image");
    expect(body.image).toMatch(/^data:image\/(png|jpeg);base64,/);
  });
});

async function waitForModels(page) {
  await page.waitForFunction(() => document.getElementById("modelSelect").options.length > 0, { timeout: 10_000 });
}

test.describe("Describe endpoint", () => {
  test("describes a red circle correctly", async () => {
    const form = new FormData();
    const buf = fileToBuffer(circlePath);
    form.append("image", new Blob([buf], { type: "image/jpeg" }), "red_circle.jpg");
    const response = await fetch(`${BASE}/describe`, { method: "POST", body: form });
    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("description");
    expect(body.description.toLowerCase()).toMatch(/circle|round/);
  });

  test("describes a blue triangle correctly", async () => {
    const form = new FormData();
    const buf = fileToBuffer(trianglePath);
    form.append("image", new Blob([buf], { type: "image/jpeg" }), "blue_triangle.jpg");
    const response = await fetch(`${BASE}/describe`, { method: "POST", body: form });
    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("description");
    expect(body.description.toLowerCase()).toMatch(/triangle/);
  });
});

test.describe("UI upload via file picker", () => {
  test("uploading files via file picker shows cards with thumbnails", async ({ page }) => {
    await page.goto("/");
    await waitForModels(page);
    await page.locator("#filePicker").setInputFiles([circlePath, trianglePath]);
    const cards = page.locator(".file-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first().locator(".status-badge")).toHaveText("Ready", { timeout: 30_000 });
  });

  test("shows error when Send is pressed without files and without prompt", async ({ page }) => {
    await page.goto("/");
    await waitForModels(page);
    await page.locator("#sendBtn").click();
    await expect(page.locator("#status")).toHaveText(/Please enter a prompt or upload at least one image/);
  });

  test("text-to-image flow: sends prompt without any uploaded images", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/");
    await waitForModels(page);
    await page.locator("#promptInput").fill("A simple green square on white background");
    await page.locator("#modelSelect").selectOption("gpt-image-2");
    await page.locator("#sizeSelect").selectOption("1:1-1024x1024");
    await page.locator("#qualitySelect").selectOption("low");
    await page.locator("#sendBtn").click();
    const outputImg = page.locator("#outputImg");
    await expect(outputImg).toBeVisible({ timeout: 240_000 });
    await expect(page.locator("#status")).toHaveText(/Done/);
  });

  test("New button resets file list, prompt, and output", async ({ page }) => {
    await page.goto("/");
    await waitForModels(page);
    await page.locator("#filePicker").setInputFiles([circlePath]);
    await page.locator("#promptInput").fill("test prompt");
    await page.locator("#newBtn").click();

    await expect(page.locator(".file-card")).toHaveCount(0);
    await expect(page.locator("#promptInput")).toHaveValue("");
    await expect(page.locator("#output")).not.toBeVisible();
  });

  test("full flow: upload, send via UI, see generated image, then reset", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/");
    await waitForModels(page);
    await page.locator("#filePicker").setInputFiles([circlePath, trianglePath]);

    const cards = page.locator(".file-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first().locator(".status-badge")).toHaveText("Ready", { timeout: 30_000 });
    await expect(cards.nth(1).locator(".status-badge")).toHaveText("Ready", { timeout: 30_000 });

    await page.locator("#promptInput").fill("Combine these two shapes into one scene");
    await page.locator("#sizeSelect").selectOption("1:1-1024x1024");
    await page.locator("#qualitySelect").selectOption("low");
    await page.locator("#sendBtn").click();

    const outputImg = page.locator("#outputImg");
    await expect(outputImg).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("#status")).toHaveText(/Done/);

    await page.locator("#newBtn").click();
    await expect(outputImg).not.toBeVisible();
    await expect(page.locator(".file-card")).toHaveCount(0);
  });

  test("prompt preview updates when files are added", async ({ page }) => {
    await page.goto("/");
    await waitForModels(page);
    await page.locator("#promptInput").fill("test scene");
    await page.locator("#filePicker").setInputFiles([circlePath]);

    const card = page.locator(".file-card");
    await expect(card).toHaveCount(1);
    await expect(card.locator(".status-badge")).toHaveText("Ready", { timeout: 30_000 });

    await expect(page.locator("#promptPreview")).toBeVisible();
    const previewText = await page.locator("#promptPreviewContent").textContent();
    expect(previewText).toContain("test scene");
    expect(previewText).toContain("I have uploaded multiple images");
  });
});

test.describe("Session save/load", () => {
  test("save and load session preserves images without re-describing", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    await waitForModels(page);

    await page.locator("#filePicker").setInputFiles([circlePath]);
    const card = page.locator(".file-card");
    await expect(card).toHaveCount(1);
    await expect(card.locator(".status-badge")).toHaveText("Ready", { timeout: 30_000 });

    await card.locator(".name").click();
    await card.locator(".name").fill("");
    await card.locator(".name").type("Custom Name Test");
    await page.locator("#promptInput").fill("save test prompt");

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#saveSessionBtn").click();
    const download = await downloadPromise;

    var stream = await download.createReadStream();
    var chunks: any[] = [];
    for await (var chunk of stream) chunks.push(chunk);
    var savedText = Buffer.concat(chunks).toString('utf-8');
    var savedJson = JSON.parse(savedText);
    expect(savedJson.images).toHaveLength(1);
    expect(savedJson.images[0].name).toBe("Custom Name Test");
    expect(savedJson.prompt).toBe("save test prompt");

    await page.locator("#newBtn").click();
    await expect(page.locator(".file-card")).toHaveCount(0);

    var tmpPath = path.join(__dirname, "..", "test-session-load.json");
    fs.writeFileSync(tmpPath, savedText);
    await page.locator("#loadSessionInput").setInputFiles(tmpPath);
    fs.unlinkSync(tmpPath);

    await expect(page.locator(".file-card")).toHaveCount(1);
    await expect(card.locator(".name")).toHaveText("Custom Name Test");
    await expect(page.locator("#promptInput")).toHaveValue("save test prompt");
    await expect(card.locator(".status-badge")).toHaveText("Ready");
  });
});
