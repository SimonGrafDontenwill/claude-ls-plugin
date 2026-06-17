#!/usr/bin/env node
/**
 * Launcher for yaml-ls (YAML Language Server).
 * Used by .lsp.json so Claude Code can start the LSP server directly.
 * Inherits stdio so the LSP protocol passes through transparently.
 *
 * Resolution order:
 * 1. YAML_LS_PATH env var (path to yaml-ls.js or the yaml-ls binary)
 * 2. @dontenwill-standard/yaml-ls installed in this plugin's node_modules
 * 3. yaml-ls found on PATH (globally installed via npm install -g)
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function findYamlLs() {
  if (process.env.YAML_LS_PATH && existsSync(process.env.YAML_LS_PATH)) {
    return { cmd: "node", args: [process.env.YAML_LS_PATH] };
  }

  const localBin = join(
    pluginRoot,
    "node_modules",
    "@dontenwill-standard",
    "yaml-ls",
    "bin",
    "yaml-ls.js",
  );
  if (existsSync(localBin)) {
    return { cmd: "node", args: [localBin] };
  }

  try {
    const which = process.platform === "win32" ? "where" : "which";
    const result = execSync(`${which} yaml-ls`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split("\n")[0]
      .trim();
    if (result && existsSync(result)) {
      return { cmd: result, args: [] };
    }
  } catch {
    // not on PATH
  }

  throw new Error(
    "YAML Language Server not found.\n" +
      "Install it: npm install @dontenwill-standard/yaml-ls\n" +
      "(Requires GitHub Packages access for @dontenwill-standard scope — see README.)\n" +
      "Or set YAML_LS_PATH to the path of yaml-ls.js.",
  );
}

let serverInfo;
try {
  serverInfo = findYamlLs();
} catch (err) {
  process.stderr.write(`[launch-yaml-ls] ${err.message}\n`);
  process.exit(1);
}

const child = spawn(serverInfo.cmd, serverInfo.args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  process.stderr.write(`[launch-yaml-ls] Failed to start: ${err.message}\n`);
  process.exit(1);
});
