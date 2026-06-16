#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { launchLanguageServer } from "./server-launcher.js";
import { LspClient, severityName } from "./lsp-client.js";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
// Lazy-initialized LSP client — started on first tool call
let lspClient = null;
function getOrCreateClient() {
    if (lspClient)
        return lspClient;
    const launch = launchLanguageServer();
    process.stderr.write(`[claude-ls-plugin] Started codeblock language server (${launch.mode}): ${launch.path}\n`);
    const client = new LspClient(launch.process);
    client.on("exit", (code) => {
        process.stderr.write(`[claude-ls-plugin] Language server exited with code ${code}\n`);
        lspClient = null;
    });
    lspClient = client;
    return client;
}
const server = new McpServer({
    name: "codeblock-language-server",
    version: "0.1.0",
});
server.tool("get_diagnostics", "Get syntax errors and warnings for a Codeblock (.dwp) file using the Codeblock Language Server.", {
    file_path: z.string().describe("Absolute path to the .dwp file to analyse"),
}, async ({ file_path }) => {
    const absolutePath = resolve(file_path);
    const rootUri = pathToFileURL(dirname(absolutePath)).href;
    const client = getOrCreateClient();
    try {
        await client.initialize(rootUri);
    }
    catch (e) {
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to initialize language server: ${e.message}`,
                },
            ],
            isError: true,
        };
    }
    let diagnostics;
    try {
        diagnostics = await client.getDiagnostics(absolutePath);
    }
    catch (e) {
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to get diagnostics: ${e.message}`,
                },
            ],
            isError: true,
        };
    }
    if (diagnostics.length === 0) {
        return {
            content: [{ type: "text", text: `No diagnostics found in ${absolutePath}` }],
        };
    }
    const lines = diagnostics.map((d) => {
        const severity = severityName(d.severity);
        const line = d.range.start.line + 1;
        const col = d.range.start.character + 1;
        const code = d.code !== undefined ? ` [${d.code}]` : "";
        return `${severity.toUpperCase()} ${line}:${col}${code} — ${d.message}`;
    });
    return {
        content: [
            {
                type: "text",
                text: `Diagnostics for ${absolutePath}:\n\n${lines.join("\n")}`,
            },
        ],
    };
});
const transport = new StdioServerTransport();
await server.connect(transport);
process.on("SIGINT", () => {
    lspClient?.shutdown();
    process.exit(0);
});
process.on("SIGTERM", () => {
    lspClient?.shutdown();
    process.exit(0);
});
//# sourceMappingURL=index.js.map