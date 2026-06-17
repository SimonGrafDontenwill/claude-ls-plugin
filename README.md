# claude-ls-plugin

Claude Code plugin that integrates two language servers:

| Language Server | Files | What it does |
|---|---|---|
| **Codeblock LS** | `.dwp` | Syntax errors & warnings via LSP (Java/Kotlin, GraalVM native) |
| **YAML LS** | `.yaml` / `.yml` | JSON schema validation + embedded JS checks (TypeScript/Rust) |

Each server is available in two ways:
- **Native LSP** — Claude sees diagnostics automatically after every edit (`.lsp.json`)
- **MCP tool** — explicit validation calls from Claude (`.mcp.json`)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Installing the Codeblock Language Server](#installing-the-codeblock-language-server)
4. [Installing the YAML Language Server](#installing-the-yaml-language-server)
5. [Building the Plugin](#building-the-plugin)
6. [Running the Plugin Locally](#running-the-plugin-locally)
7. [Publishing to the Claude Marketplace](#publishing-to-the-claude-marketplace)
8. [Architecture](#architecture)
9. [MCP Tools Reference](#mcp-tools-reference)
10. [Environment Variable Overrides](#environment-variable-overrides)

---

## Prerequisites

- **Node.js** ≥ 18.17
- **npm** ≥ 9
- **Git**
- For the Codeblock LS native binary: **Docker** (Windows Container mode for Windows builds, Linux for Linux builds), or a pre-built binary
- For the YAML LS: access to the `@dontenwill-standard` scope on GitHub Packages

---

## Local Development Setup

```powershell
git clone https://github.com/dontenwill-standard/claude-ls-plugin
cd claude-ls-plugin
npm install
npm run build
```

---

## Installing the Codeblock Language Server

The Codeblock LS ships as a native binary (no JVM at runtime) built with GraalVM.
Binaries are uploaded manually to a public endpoint — the URL will be provided separately.

### Option A — Download pre-built binary (recommended)

Download the binary for your platform from the public endpoint and place it at the default location:

| Platform | Default path |
|---|---|
| Windows | `%LOCALAPPDATA%\opencode\bin\codeblock-ls\codeblock-language-server.exe` |
| Linux | `~/.local/share/opencode/bin/codeblock-ls/codeblock-language-server` |
| macOS | `~/.local/share/opencode/bin/codeblock-ls/codeblock-language-server` (JAR fallback only) |

Or use the setup script from the `codeblock_language_server` repository to download and install automatically (once the endpoint is configured in the script).

### Option B — Build from source

Requires the `codeblock_language_server` repository checked out locally.

```powershell
# Windows native binary (~31 MB, no JVM needed)
cd C:\Dev\codeblock_language_server
.\gradlew.bat buildNativeWindows    # builds via Docker Windows container
.\scripts\setup-opencode.ps1        # copies EXE + JAR to default location
```

```bash
# Linux native binary
cd /dev/codeblock_language_server
./gradlew buildNativeLinux          # builds via Docker Linux container
./scripts/setup-opencode-macos.sh   # or the Linux equivalent
```

### Option C — Fat JAR fallback (any platform, requires JVM 21+)

```powershell
cd C:\Dev\codeblock_language_server
.\gradlew.bat :modules:language-server-lsp-launcher:shadowJar
.\scripts\setup-opencode.ps1
```

The launcher script automatically prefers the native binary and falls back to the JAR.

### Environment variable overrides

| Variable | Description |
|---|---|
| `CODEBLOCK_LS_PATH` | Absolute path to the native binary |
| `CODEBLOCK_LS_JAR` | Absolute path to the fat JAR (`*-all.jar`) |
| `JAVA_HOME` | Path to JDK 21+ (used for JAR fallback) |

---

## Installing the YAML Language Server

The YAML LS is published as `@dontenwill-standard/yaml-ls` to **GitHub Packages** (not the public npm registry). You need to authenticate first.

### Step 1 — Authenticate with GitHub Packages

Create a GitHub personal access token (PAT) with `read:packages` scope at  
`https://github.com/settings/tokens/new` → select **read:packages**.

Add the token to your npm config (once, per machine):

```powershell
# Windows PowerShell
npm config set @dontenwill-standard:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_PAT
```

```bash
# Linux / macOS
npm config set @dontenwill-standard:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_PAT
```

Alternatively, create or extend `~/.npmrc`:

```ini
@dontenwill-standard:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT
```

### Step 2 — Install the package

**Option A — as part of this plugin (recommended)**

Once the registry is configured, `npm install` in the plugin directory will automatically
resolve the `optionalDependency` `@dontenwill-standard/yaml-ls`:

```powershell
cd C:\Dev\claude-ls-plugin
npm install
```

**Option B — global install**

```powershell
npm install -g @dontenwill-standard/yaml-ls
```

The plugin launcher will find the `yaml-ls` binary on `PATH` automatically.

### Environment variable override

| Variable | Description |
|---|---|
| `YAML_LS_PATH` | Absolute path to `yaml-ls.js` (skips auto-discovery) |

---

## Building the Plugin

```powershell
npm run build
```

TypeScript sources in `src/` are compiled to `dist/`:

| Source | Output | Purpose |
|---|---|---|
| `src/index.ts` | `dist/index.js` | MCP server — `get_diagnostics` tool (Codeblock LS) |
| `src/yaml-mcp.ts` | `dist/yaml-mcp.js` | MCP server — `validate_yaml` tool (YAML LS) |
| `src/lsp-client.ts` | `dist/lsp-client.js` | Shared LSP JSON-RPC client |
| `src/server-launcher.ts` | `dist/server-launcher.js` | Codeblock LS process launcher |
| `src/yaml-launcher.ts` | `dist/yaml-launcher.js` | YAML LS process launcher |

---

## Running the Plugin Locally

```powershell
# Start Claude Code with this plugin directory
claude --plugin-dir C:\Dev\claude-ls-plugin
```

To verify both MCP servers are active, run inside Claude Code:

```
/mcp
```

You should see `codeblock-ls` and `yaml-ls` listed as connected servers.

---

## Publishing to the Claude Marketplace

> **Current state of the Claude Marketplace**
> As of mid-2025, the Claude Code plugin marketplace is in early access. The exact
> publication workflow is subject to change. The steps below reflect the current
> self-hosted/URL-based approach documented by Anthropic.

### Step 1 — Push the repository to GitHub

The repository must be publicly accessible (or accessible by your target users).

```powershell
git remote add origin https://github.com/dontenwill-standard/claude-ls-plugin.git
git push -u origin master
```

### Step 2 — Verify the plugin metadata

Claude Code reads two files from the repository root:

| File | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Plugin identity, version, author |
| `.claude-plugin/marketplace.json` | Marketplace listing with plugin entries |
| `.lsp.json` | LSP server registrations |
| `.mcp.json` | MCP server registrations |

Check that all paths, names, and versions are consistent before publishing.

### Step 3 — Test the plugin install command

Any user (or yourself) can install the plugin directly from the GitHub URL:

```
/plugin install github:dontenwill-standard/claude-ls-plugin
```

This command:
1. Clones the repository into Claude Code's plugin directory
2. Runs `npm install` (which triggers `postinstall.mjs` to register MCP servers in `~/.claude/settings.json`)
3. Runs `npm run build`
4. Registers the LSP servers from `.lsp.json`

Test the install on a clean machine or in a separate user profile to confirm everything works end-to-end.

### Step 4 — Submit to the Anthropic-hosted marketplace (when available)

When Anthropic opens marketplace submissions:

1. Go to the Claude Code developer portal (URL TBD by Anthropic)
2. Submit the GitHub repository URL
3. Anthropic reviews `plugin.json` / `marketplace.json` for correctness
4. After approval, users can install via:
   ```
   /plugin install dontenwill-language-servers
   ```

### Step 5 — Versioning

Follow semantic versioning. When releasing a new version:

```powershell
# Update version in package.json and .claude-plugin/plugin.json, then:
git tag v0.2.0
git push origin v0.2.0
```

Claude Code resolves plugins from the default branch (`main`/`master`) unless a specific
ref is given:

```
/plugin install github:dontenwill-standard/claude-ls-plugin@v0.2.0
```

---

## Architecture

```
Claude Code
  ├── LSP integration (.lsp.json)           — live diagnostics on every edit
  │     ├── bin/launch-codeblock-ls.mjs
  │     │     └── Codeblock Language Server (native EXE or JAR fallback)
  │     └── bin/launch-yaml-ls.mjs
  │           └── YAML Language Server (via @dontenwill-standard/yaml-ls)
  │
  └── MCP tools (.mcp.json)                 — explicit validation calls
        ├── dist/index.js
        │     └── get_diagnostics  → Codeblock LS (native EXE or JAR fallback)
        └── dist/yaml-mcp.js
              └── validate_yaml    → YAML LS (via @dontenwill-standard/yaml-ls)
```

Both MCP servers lazily start their language server process on the first tool call and keep it alive for the session lifetime.

---

## MCP Tools Reference

### `get_diagnostics` (server: `codeblock-ls`)

Returns syntax errors and warnings for a `.dwp` file.

| Parameter | Type | Description |
|---|---|---|
| `file_path` | string | Absolute path to the `.dwp` file |

**Example output:**
```
Diagnostics for C:/project/main.dwp:

ERROR 12:5 [syntax-error] — missing ';' at 'end'
WARNING 34:1 [unused-var] — variable 'x' is declared but never used
```

---

### `validate_yaml` (server: `yaml-ls`)

Validates a `.yaml` / `.yml` file against its configured JSON schema and checks embedded JavaScript.

| Parameter | Type | Description |
|---|---|---|
| `file_path` | string | Absolute path to the `.yaml` or `.yml` file |

**Example output:**
```
Diagnostics for C:/project/pages/dashboard.page.yaml:

ERROR 5:3 [schema] — Property 'type' is required
WARNING 22:7 [js] — Variable 'ctx' is used before assignment
```

---

## Environment Variable Overrides

| Variable | Server | Description |
|---|---|---|
| `CODEBLOCK_LS_PATH` | Codeblock | Path to native binary |
| `CODEBLOCK_LS_JAR` | Codeblock | Path to fat JAR (`*-all.jar`) |
| `JAVA_HOME` | Codeblock | Path to JDK 21+ for JAR fallback |
| `YAML_LS_PATH` | YAML | Path to `yaml-ls.js` |
