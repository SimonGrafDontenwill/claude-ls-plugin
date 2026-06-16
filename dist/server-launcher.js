import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
function candidatePaths() {
    const isWindows = process.platform === "win32";
    const envPath = process.env["CODEBLOCK_LS_PATH"];
    const candidates = [];
    if (envPath) {
        candidates.push(envPath);
    }
    if (isWindows) {
        const localAppData = process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local");
        candidates.push(join(localAppData, "opencode", "bin", "codeblock-ls", "codeblock-language-server.exe"));
    }
    else {
        const xdgData = process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share");
        candidates.push(join(xdgData, "opencode", "bin", "codeblock-ls", "codeblock-language-server"));
    }
    return candidates;
}
function findJarCandidates() {
    const envJar = process.env["CODEBLOCK_LS_JAR"];
    if (envJar)
        return [envJar];
    const isWindows = process.platform === "win32";
    const localAppData = isWindows
        ? (process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local"))
        : (process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share"));
    return [join(localAppData, "opencode", "bin", "codeblock-ls", "codeblock-language-server.jar")];
}
export function launchLanguageServer() {
    for (const p of candidatePaths()) {
        if (existsSync(p)) {
            return {
                process: spawn(p, [], { stdio: ["pipe", "pipe", "pipe"] }),
                mode: "native",
                path: p,
            };
        }
    }
    const java = process.env["JAVA_HOME"]
        ? join(process.env["JAVA_HOME"], "bin", "java")
        : "java";
    for (const jar of findJarCandidates()) {
        if (existsSync(jar)) {
            return {
                process: spawn(java, ["-jar", jar], { stdio: ["pipe", "pipe", "pipe"] }),
                mode: "jar",
                path: jar,
            };
        }
    }
    throw new Error("Codeblock Language Server not found.\n" +
        "Set CODEBLOCK_LS_PATH (native binary) or CODEBLOCK_LS_JAR (fat jar), " +
        "or run the OpenCode setup script to install it to the default location.");
}
//# sourceMappingURL=server-launcher.js.map