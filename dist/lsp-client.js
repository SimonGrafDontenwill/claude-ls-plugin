import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
const SEVERITY_NAME = {
    1: "error",
    2: "warning",
    3: "information",
    4: "hint",
};
export function severityName(s) {
    return SEVERITY_NAME[s] ?? "unknown";
}
export class LspClient extends EventEmitter {
    proc;
    languageId;
    buffer = "";
    nextId = 1;
    pending = new Map();
    diagnostics = new Map();
    initialized = false;
    constructor(proc, languageId = "codeblock") {
        super();
        this.proc = proc;
        this.languageId = languageId;
        proc.stdout.setEncoding("utf8");
        proc.stdout.on("data", (chunk) => this.onData(chunk));
        proc.stderr.on("data", (chunk) => {
            // Suppress stderr — language server debug output
            void chunk;
        });
        proc.on("exit", (code) => this.emit("exit", code));
    }
    onData(chunk) {
        this.buffer += chunk;
        while (true) {
            const headerEnd = this.buffer.indexOf("\r\n\r\n");
            if (headerEnd === -1)
                break;
            const header = this.buffer.slice(0, headerEnd);
            const match = /Content-Length:\s*(\d+)/i.exec(header);
            if (!match) {
                this.buffer = this.buffer.slice(headerEnd + 4);
                continue;
            }
            const length = parseInt(match[1], 10);
            const bodyStart = headerEnd + 4;
            if (this.buffer.length < bodyStart + length)
                break;
            const body = this.buffer.slice(bodyStart, bodyStart + length);
            this.buffer = this.buffer.slice(bodyStart + length);
            try {
                const msg = JSON.parse(body);
                this.handleMessage(msg);
            }
            catch {
                // malformed JSON — skip
            }
        }
    }
    handleMessage(msg) {
        if (msg.id !== undefined && !msg.method) {
            const resolve = this.pending.get(msg.id);
            if (resolve) {
                this.pending.delete(msg.id);
                resolve(msg);
            }
        }
        else if (msg.method === "textDocument/publishDiagnostics") {
            const params = msg.params;
            this.diagnostics.set(params.uri, params.diagnostics ?? []);
            this.emit("diagnostics", params.uri, params.diagnostics ?? []);
        }
    }
    send(message) {
        const body = JSON.stringify(message);
        const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
        this.proc.stdin.write(header + body);
    }
    request(method, params) {
        return new Promise((resolve) => {
            const id = this.nextId++;
            this.pending.set(id, resolve);
            this.send({ jsonrpc: "2.0", id, method, params });
        });
    }
    notify(method, params) {
        this.send({ jsonrpc: "2.0", method, params });
    }
    async initialize(rootUri) {
        if (this.initialized)
            return;
        await this.request("initialize", {
            processId: process.pid,
            rootUri,
            initializationOptions: {
                optimizeForUseWithoutKnownSystemContext: true,
                debugMode: false,
            },
            capabilities: {
                textDocument: {
                    publishDiagnostics: { relatedInformation: false },
                },
            },
            trace: "off",
        });
        this.notify("initialized", {});
        this.initialized = true;
    }
    async getDiagnostics(filePath) {
        const uri = pathToUri(filePath);
        let content;
        try {
            content = readFileSync(filePath, "utf8");
        }
        catch (e) {
            throw new Error(`Cannot read file: ${filePath} — ${e.message}`);
        }
        this.diagnostics.delete(uri);
        this.notify("textDocument/didOpen", {
            textDocument: {
                uri,
                languageId: this.languageId,
                version: 1,
                text: content,
            },
        });
        const diags = await this.waitForDiagnostics(uri, 5000);
        this.notify("textDocument/didClose", { textDocument: { uri } });
        return diags;
    }
    waitForDiagnostics(uri, timeoutMs) {
        if (this.diagnostics.has(uri)) {
            return Promise.resolve(this.diagnostics.get(uri));
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off("diagnostics", handler);
                // Timeout is not an error — the server may not publish if there are no issues
                resolve([]);
            }, timeoutMs);
            const handler = (diagUri, diags) => {
                if (diagUri === uri) {
                    clearTimeout(timer);
                    this.off("diagnostics", handler);
                    resolve(diags);
                }
            };
            this.on("diagnostics", handler);
        });
    }
    shutdown() {
        try {
            this.request("shutdown", null).then(() => {
                this.notify("exit", null);
            });
        }
        catch {
            this.proc.kill();
        }
    }
}
function pathToUri(filePath) {
    // Normalize Windows backslashes
    const normalized = filePath.replace(/\\/g, "/");
    const encoded = normalized.replace(/[^a-zA-Z0-9/_.:~!$&'()*+,;=@-]/g, encodeURIComponent);
    if (/^[a-zA-Z]:/.test(encoded)) {
        return `file:///${encoded}`;
    }
    return `file://${encoded}`;
}
//# sourceMappingURL=lsp-client.js.map