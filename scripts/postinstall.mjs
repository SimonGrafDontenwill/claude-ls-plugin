#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, createWriteStream, unlinkSync, chmodSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(pluginRoot, "dist").replace(/\\/g, "/");

// ─── MCP server registration ───────────────────────────────────────────────

const settingsPath = join(homedir(), ".claude", "settings.json");
const settingsDir = dirname(settingsPath);

function readSettings() {
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    console.error(`[claude-ls-plugin] Warning: could not parse ${settingsPath} — skipping.`);
    return null;
  }
}

function writeSettings(settings) {
  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

const settings = readSettings();
if (settings !== null) {
  settings.mcpServers ??= {};
  let changed = false;

  const codeblockEntry = join(distDir, "index.js");
  if (settings.mcpServers["codeblock-ls"]?.args?.[0] !== codeblockEntry) {
    settings.mcpServers["codeblock-ls"] = { command: "node", args: [codeblockEntry] };
    changed = true;
  }

  const yamlEntry = join(distDir, "yaml-mcp.js");
  if (settings.mcpServers["yaml-ls"]?.args?.[0] !== yamlEntry) {
    settings.mcpServers["yaml-ls"] = { command: "node", args: [yamlEntry] };
    changed = true;
  }

  if (changed) {
    writeSettings(settings);
    console.log(`[claude-ls-plugin] Registered MCP servers 'codeblock-ls' and 'yaml-ls' in ${settingsPath}`);
  } else {
    console.log("[claude-ls-plugin] MCP entries already up to date in", settingsPath);
  }
}

// ─── Codeblock Language Server binary download ────────────────────────────

const BINARY_URLS = {
  win32: "https://documentation-businessexpress-prod.s3.eu-central-1.amazonaws.com/assets/codeblock-language-server.exe",
  linux: "https://documentation-businessexpress-prod.s3.eu-central-1.amazonaws.com/assets/codeblock-language-server",
};

function getTargetPath() {
  const os = platform();
  const isWindows = os === "win32";

  if (process.env.CODEBLOCK_LS_PATH) return null; // user manages binary manually

  const baseDir = isWindows
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "opencode", "bin", "codeblock-ls")
    : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "opencode", "bin", "codeblock-ls");

  const binaryName = isWindows ? "codeblock-language-server.exe" : "codeblock-language-server";
  return { dir: baseDir, path: join(baseDir, binaryName), isWindows };
}

async function downloadCodeblockLs() {
  if (process.env.SKIP_CODEBLOCK_LS_DOWNLOAD === "1") {
    console.log("[claude-ls-plugin] SKIP_CODEBLOCK_LS_DOWNLOAD=1 — skipping binary download.");
    return;
  }

  const os = platform();
  const url = BINARY_URLS[os];

  if (!url) {
    console.log(`[claude-ls-plugin] No pre-built binary available for ${os}. Install the JDK and build from source, or set CODEBLOCK_LS_JAR.`);
    return;
  }

  const target = getTargetPath();
  if (!target) return; // CODEBLOCK_LS_PATH is set

  if (existsSync(target.path)) {
    console.log(`[claude-ls-plugin] Codeblock LS binary already present at ${target.path}`);
    return;
  }

  console.log(`[claude-ls-plugin] Downloading Codeblock Language Server (~31 MB)...`);
  if (!existsSync(target.dir)) mkdirSync(target.dir, { recursive: true });

  const tmpPath = target.path + ".download";
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

    const total = Number(response.headers.get("content-length") ?? 0);
    let received = 0;
    let lastPct = -1;

    const progressStream = new TransformStream({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (total > 0) {
          const pct = Math.floor((received / total) * 100);
          if (pct !== lastPct && pct % 10 === 0) {
            process.stdout.write(`\r[claude-ls-plugin] Downloading... ${pct}%`);
            lastPct = pct;
          }
        }
        controller.enqueue(chunk);
      },
    });

    const writeStream = createWriteStream(tmpPath);
    await pipeline(
      Readable.fromWeb(response.body.pipeThrough(progressStream)),
      writeStream,
    );

    process.stdout.write("\n");

    // Rename temp → final only after successful download
    const { renameSync } = await import("node:fs");
    renameSync(tmpPath, target.path);

    if (!target.isWindows) chmodSync(target.path, 0o755);

    console.log(`[claude-ls-plugin] Codeblock LS installed to ${target.path}`);
  } catch (err) {
    if (existsSync(tmpPath)) {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }
    console.error(`[claude-ls-plugin] Warning: binary download failed — ${err.message}`);
    console.error(`[claude-ls-plugin] Download manually from: ${url}`);
    console.error(`[claude-ls-plugin] and place it at: ${target.path}`);
  }
}

await downloadCodeblockLs();
