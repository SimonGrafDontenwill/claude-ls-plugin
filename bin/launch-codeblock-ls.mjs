#!/usr/bin/env node
/**
 * Launcher for codeblock-language-server with EXE→JAR fallback.
 * Used by .lsp.json so Claude Code can start the LSP server directly.
 * Inherits stdio so the LSP protocol passes through transparently.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

function findServer() {
  const isWindows = platform() === "win32";

  if (process.env.CODEBLOCK_LS_PATH && existsSync(process.env.CODEBLOCK_LS_PATH)) {
    return { cmd: process.env.CODEBLOCK_LS_PATH, args: [] };
  }

  const defaultDir = isWindows
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "opencode", "bin", "codeblock-ls")
    : join(homedir(), ".local", "share", "opencode", "bin", "codeblock-ls");

  const binaryName = isWindows ? "codeblock-language-server.exe" : "codeblock-language-server";
  const binaryPath = join(defaultDir, binaryName);

  if (existsSync(binaryPath)) {
    return { cmd: binaryPath, args: [] };
  }

  if (process.env.CODEBLOCK_LS_JAR && existsSync(process.env.CODEBLOCK_LS_JAR)) {
    return { cmd: "java", args: ["-jar", process.env.CODEBLOCK_LS_JAR] };
  }

  if (existsSync(defaultDir)) {
    const jars = readdirSync(defaultDir).filter((f) => f.endsWith("-all.jar"));
    if (jars.length > 0) {
      return { cmd: "java", args: ["-jar", join(defaultDir, jars[0])] };
    }
  }

  throw new Error(
    "Codeblock Language Server not found. " +
      "Run the setup script from codeblock_language_server, or set CODEBLOCK_LS_PATH / CODEBLOCK_LS_JAR.",
  );
}

let serverInfo;
try {
  serverInfo = findServer();
} catch (err) {
  process.stderr.write(`[launch-codeblock-ls] ${err.message}\n`);
  process.exit(1);
}

const child = spawn(serverInfo.cmd, serverInfo.args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  process.stderr.write(`[launch-codeblock-ls] Failed to start: ${err.message}\n`);
  process.exit(1);
});
