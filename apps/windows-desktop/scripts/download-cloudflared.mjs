/**
 * Download cloudflared binary for Windows (x64).
 * Pinned version ensures reproducible builds.
 * Skips download if binary already exists.
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const CF_VERSION = "2024.12.0";
const CF_URL = `https://github.com/cloudflare/cloudflared/releases/download/${CF_VERSION}/cloudflared-windows-amd64.exe`;
const OUTPUT = path.join(import.meta.dirname, "..", "resources", "cloudflared.exe");

if (fs.existsSync(OUTPUT)) {
  console.log("cloudflared.exe already exists, skipping download");
  process.exit(0);
}

console.log(`Downloading cloudflared ${CF_VERSION}...`);

/**
 * Follow redirects (GitHub releases redirect to CDN).
 * Max 5 redirects to prevent infinite loops.
 */
function download(url, dest, redirectCount = 0) {
  if (redirectCount > 5) {
    console.error("Too many redirects");
    process.exit(1);
  }

  https.get(url, (res) => {
    // Follow redirects (301, 302, 307, 308)
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      download(res.headers.location, dest, redirectCount + 1);
      return;
    }

    if (res.statusCode !== 200) {
      console.error(`Download failed: HTTP ${res.statusCode}`);
      process.exit(1);
    }

    const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
    let downloaded = 0;

    const file = fs.createWriteStream(dest);
    res.pipe(file);

    res.on("data", (chunk) => {
      downloaded += chunk.length;
      if (totalBytes > 0) {
        const pct = ((downloaded / totalBytes) * 100).toFixed(1);
        process.stdout.write(`\rProgress: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
      }
    });

    file.on("finish", () => {
      file.close();
      console.log(`\nSaved to ${dest}`);
    });

    file.on("error", (err) => {
      fs.unlinkSync(dest);
      console.error(`Write error: ${err.message}`);
      process.exit(1);
    });
  }).on("error", (err) => {
    console.error(`Download error: ${err.message}`);
    process.exit(1);
  });
}

download(CF_URL, OUTPUT);
