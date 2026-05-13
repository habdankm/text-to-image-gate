import { test, expect } from "@playwright/test";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const circlePath    = path.resolve(__dirname, "..", "red_circle.jpg");
const trianglePath  = path.resolve(__dirname, "..", "blue_triangle.jpg");
const squarePath    = path.resolve(__dirname, "..", "green_square.jpg");

test.describe("POST /generate API", () => {
  test("returns an image when sending two files with a prompt", async ({ request }) => {
    const formData = new FormData();
    formData.append("images", new File([fs.readFileSync(circlePath)], "red_circle.jpg", { type: "image/jpeg" }));
    formData.append("images", new File([fs.readFileSync(trianglePath)], "blue_triangle.jpg", { type: "image/jpeg" }));
    formData.append("prompt", "Combine these two shapes into a single scene");

    const response = await request.post("/generate", {
      multipart: formData,
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty("image");
    expect(body.image).toMatch(/^data:image\/png;base64,/);
  });

  test("returns 400 when no files are sent", async ({ request }) => {
    const response = await request.post("/generate", {
      multipart: { prompt: "test" },
    });

    expect(response.status()).toBe(400);
  });
});

test.describe("Describe endpoint", () => {
  test("describes a red circle correctly", async ({ request }) => {
    const formData = new FormData();
    formData.append("image", new File([fs.readFileSync(circlePath)], "red_circle.jpg", { type: "image/jpeg" }));
    const response = await request.post("/describe", { multipart: formData });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("description");
    expect(body.description.toLowerCase()).toMatch(/circle|round/);
  });

  test("describes a blue triangle correctly", async ({ request }) => {
    const formData = new FormData();
    formData.append("image", new File([fs.readFileSync(trianglePath)], "blue_triangle.jpg", { type: "image/jpeg" }));
    const response = await request.post("/describe", { multipart: formData });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("description");
    expect(body.description.toLowerCase()).toMatch(/triangle/);
  });
});

test.describe("UI upload via file picker", () => {
  test("uploading files via file picker shows cards with thumbnails", async ({ page }) => {
    await page.goto("/");
    await page.locator("#filePicker").setInputFiles([circlePath, trianglePath]);
    const cards = page.locator(".file-card");
    await expect(cards).toHaveCount(2);
    // Wait for descriptions to complete
    await expect(cards.first().locator(".status-badge")).toHaveText("Ready", { timeout: 30_000 });
  });

  test("shows error when Send is pressed without files", async ({ page }) => {
    await page.goto("/");
    await page.locator("#sendBtn").click();
    await expect(page.locator("#status")).toHaveText(/Please add at least one image/);
  });

  test("New button resets file list, prompt, and output", async ({ page }) => {
    await page.goto("/");
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
    await page.locator("#filePicker").setInputFiles([circlePath, trianglePath]);

    const cards = page.locator(".file-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first().locator(".status-badge")).toHaveText("Ready", { timeout: 30_000 });
    await expect(cards.nth(1).locator(".status-badge")).toHaveText("Ready", { timeout: 30_000 });

    await page.locator("#promptInput").fill("Combine these two shapes into one scene");
    await page.locator("#sendBtn").click();

    const outputImg = page.locator("#outputImg");
    await expect(outputImg).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("#status")).toHaveText(/Done/);

    // Reset
    await page.locator("#newBtn").click();
    await expect(outputImg).not.toBeVisible();
    await expect(page.locator(".file-card")).toHaveCount(0);
  });

  test("prompt preview updates when files are added", async ({ page }) => {
    await page.goto("/");
    await page.locator("#promptInput").fill("test scene");
    await page.locator("#filePicker").setInputFiles([circlePath]);

    // Wait for description to complete
    const card = page.locator(".file-card");
    await expect(card).toHaveCount(1);
    await expect(card.locator(".status-badge")).toHaveText("Ready", { timeout: 30_000 });

    // Prompt preview should be visible
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

    // Upload and wait for description
    await page.locator("#filePicker").setInputFiles([circlePath]);
    const card = page.locator(".file-card");
    await expect(card).toHaveCount(1);
    await expect(card.locator(".status-badge")).toHaveText("Ready", { timeout: 30_000 });

    // Edit name to something we can verify
    await card.locator(".name").click();
    await card.locator(".name").fill("");
    await card.locator(".name").type("Custom Name Test");
    await page.locator("#promptInput").fill("save test prompt");

    // Save session via download
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#saveSessionBtn").click();
    const download = await downloadPromise;

    // Read the saved file's content directly via createReadStream
    var stream = await download.createReadStream();
    var chunks = [];
    for await (var chunk of stream) chunks.push(chunk);
    var savedText = Buffer.concat(chunks).toString('utf-8');
    var savedJson = JSON.parse(savedText);
    expect(savedJson.images).toHaveLength(1);
    expect(savedJson.images[0].name).toBe("Custom Name Test");
    expect(savedJson.prompt).toBe("save test prompt");

    // Reset UI  
    await page.locator("#newBtn").click();
    await expect(page.locator(".file-card")).toHaveCount(0);

    // Load session back — write download to a temp path for setInputFiles
    var tmpPath = path.join(__dirname, "..", "test-session-load.json");
    fs.writeFileSync(tmpPath, savedText);
    await page.locator("#loadSessionInput").setInputFiles(tmpPath);
    fs.unlinkSync(tmpPath);

    // Verify restored state
    await expect(page.locator(".file-card")).toHaveCount(1);
    await expect(card.locator(".name")).toHaveText("Custom Name Test");
    await expect(page.locator("#promptInput")).toHaveValue("save test prompt");

    // Verify it didn't fire a description (should already be "Ready")
    await expect(card.locator(".status-badge")).toHaveText("Ready");
  });
});
