import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
function findYamlLsBin() {
    const envPath = process.env["YAML_LS_PATH"];
    if (envPath && existsSync(envPath)) {
        return { cmd: "node", args: [envPath] };
    }
    const localBin = join(pluginRoot, "node_modules", "@dontenwill-standard", "yaml-ls", "bin", "yaml-ls.js");
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
    }
    catch {
        // not on PATH
    }
    throw new Error("YAML Language Server not found.\n" +
        "Install it: npm install @dontenwill-standard/yaml-ls\n" +
        "(Requires GitHub Packages access for @dontenwill-standard scope — see README.)\n" +
        "Or set YAML_LS_PATH to the path of yaml-ls.js.");
}
export function launchYamlLanguageServer() {
    const { cmd, args } = findYamlLsBin();
    return {
        process: spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] }),
        path: args[0] ?? cmd,
    };
}
//# sourceMappingURL=yaml-launcher.js.map