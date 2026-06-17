#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(pluginRoot, "dist").replace(/\\/g, "/");

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

if (!changed) {
  console.log("[claude-ls-plugin] MCP entries already up to date in", settingsPath);
  process.exit(0);
}

writeSettings(settings);
console.log(`[claude-ls-plugin] Registered MCP servers 'codeblock-ls' and 'yaml-ls' in ${settingsPath}`);
