#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = join(pluginRoot, "dist", "index.js").replace(/\\/g, "/");

// Claude Code stores settings in ~/.claude/settings.json (global)
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
if (settings === null) process.exit(0);

settings.mcpServers ??= {};

const existing = settings.mcpServers["codeblock-ls"];
if (existing?.args?.[0] === entryPoint) {
  console.log("[claude-ls-plugin] MCP entry already up to date in", settingsPath);
  process.exit(0);
}

settings.mcpServers["codeblock-ls"] = {
  command: "node",
  args: [entryPoint],
};

writeSettings(settings);
console.log(`[claude-ls-plugin] Registered MCP server 'codeblock-ls' in ${settingsPath}`);
