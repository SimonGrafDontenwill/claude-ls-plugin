# claude-ls-plugin

Claude Code plugin that integrates the [Codeblock Language Server](https://github.com/dontenwill-standard/codeblock_language_server) for `.dwp` files.

Provides:
- **Native LSP integration** — Claude sees syntax errors and warnings automatically after each edit (via `.lsp.json`)
- **`get_diagnostics` MCP tool** — explicit diagnostic queries from Claude (via `.mcp.json`)

## Installation

### Via Claude Code plugin system (recommended)

```shell
/plugin install github:dontenwill-standard/claude-ls-plugin
```

### Manual (development)

```powershell
git clone https://github.com/dontenwill-standard/claude-ls-plugin
cd claude-ls-plugin
npm install
npm run build
claude --plugin-dir .
```

## Prerequisites

The Codeblock Language Server must be installed separately. Run the setup script from the `codeblock_language_server` repository:

```powershell
# Native binary (recommended — no JVM required)
.\gradlew.bat buildNativeWindows
.\scripts\setup-opencode.ps1
```

Or set environment variables to override the binary location:

| Variable | Description |
|---|---|
| `CODEBLOCK_LS_PATH` | Path to native binary (`codeblock-language-server.exe` / `codeblock-language-server`) |
| `CODEBLOCK_LS_JAR` | Path to fat JAR (`*-all.jar`) |

## Architecture

```
Claude Code
  ├── LSP integration (.lsp.json)        — automatic diagnostics on every save
  │     └── bin/launch-codeblock-ls.mjs
  │           └── Codeblock Language Server (native EXE / JAR fallback)
  │
  └── MCP tool (.mcp.json)               — explicit get_diagnostics calls
        └── dist/index.js (Node.js)
              └── Codeblock Language Server (native EXE / JAR fallback)
```

## MCP Tool: `get_diagnostics`

Returns syntax errors and warnings for a `.dwp` file.

**Input:** `file_path` — absolute path to the `.dwp` file

**Example output:**
```
Diagnostics for C:/project/main.dwp:

ERROR 12:5 [syntax-error] — missing ';' at 'end'
WARNING 34:1 [unused-var] — variable 'x' is declared but never used
```
