import { ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface LspPosition {
  line: number;
  character: number;
}

interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspDiagnostic {
  range: LspRange;
  severity: 1 | 2 | 3 | 4; // Error | Warning | Information | Hint
  message: string;
  code?: string | number;
  source?: string;
}

const SEVERITY_NAME: Record<number, string> = {
  1: "error",
  2: "warning",
  3: "information",
  4: "hint",
};

export function severityName(s: number): string {
  return SEVERITY_NAME[s] ?? "unknown";
}

export class LspClient extends EventEmitter {
  private readonly proc: ChildProcessWithoutNullStreams;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, (msg: JsonRpcMessage) => void>();
  private readonly diagnostics = new Map<string, LspDiagnostic[]>();
  private initialized = false;

  constructor(proc: ChildProcessWithoutNullStreams) {
    super();
    this.proc = proc;

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => this.onData(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      // Suppress stderr — language server debug output
      void chunk;
    });
    proc.on("exit", (code) => this.emit("exit", code));
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const length = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) break;

      const body = this.buffer.slice(bodyStart, bodyStart + length);
      this.buffer = this.buffer.slice(bodyStart + length);

      try {
        const msg: JsonRpcMessage = JSON.parse(body);
        this.handleMessage(msg);
      } catch {
        // malformed JSON — skip
      }
    }
  }

  private handleMessage(msg: JsonRpcMessage): void {
    if (msg.id !== undefined && !msg.method) {
      const resolve = this.pending.get(msg.id as number);
      if (resolve) {
        this.pending.delete(msg.id as number);
        resolve(msg);
      }
    } else if (msg.method === "textDocument/publishDiagnostics") {
      const params = msg.params as { uri: string; diagnostics: LspDiagnostic[] };
      this.diagnostics.set(params.uri, params.diagnostics ?? []);
      this.emit("diagnostics", params.uri, params.diagnostics ?? []);
    }
  }

  private send(message: object): void {
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
    this.proc.stdin.write(header + body);
  }

  private request(method: string, params: unknown): Promise<JsonRpcMessage> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  async initialize(rootUri: string): Promise<void> {
    if (this.initialized) return;
    await this.request("initialize", {
      processId: process.pid,
      rootUri,
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

  async getDiagnostics(filePath: string): Promise<LspDiagnostic[]> {
    const uri = pathToUri(filePath);
    let content: string;
    try {
      content = readFileSync(filePath, "utf8");
    } catch (e: unknown) {
      throw new Error(`Cannot read file: ${filePath} — ${(e as Error).message}`);
    }

    this.diagnostics.delete(uri);

    this.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "codeblock",
        version: 1,
        text: content,
      },
    });

    const diags = await this.waitForDiagnostics(uri, 5000);
    this.notify("textDocument/didClose", { textDocument: { uri } });
    return diags;
  }

  private waitForDiagnostics(uri: string, timeoutMs: number): Promise<LspDiagnostic[]> {
    if (this.diagnostics.has(uri)) {
      return Promise.resolve(this.diagnostics.get(uri)!);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off("diagnostics", handler);
        // Timeout is not an error — the server may not publish if there are no issues
        resolve([]);
      }, timeoutMs);

      const handler = (diagUri: string, diags: LspDiagnostic[]) => {
        if (diagUri === uri) {
          clearTimeout(timer);
          this.off("diagnostics", handler);
          resolve(diags);
        }
      };
      this.on("diagnostics", handler);
    });
  }

  shutdown(): void {
    try {
      this.request("shutdown", null).then(() => {
        this.notify("exit", null);
      });
    } catch {
      this.proc.kill();
    }
  }
}

function pathToUri(filePath: string): string {
  // Normalize Windows backslashes
  const normalized = filePath.replace(/\\/g, "/");
  const encoded = normalized.replace(/[^a-zA-Z0-9/_.:~!$&'()*+,;=@-]/g, encodeURIComponent);
  if (/^[a-zA-Z]:/.test(encoded)) {
    return `file:///${encoded}`;
  }
  return `file://${encoded}`;
}
