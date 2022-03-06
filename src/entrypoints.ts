import nativePath from "path";
import type { PluginBuild } from "esbuild";
import type { PluginData } from "./pluginData";

import { normalize } from "./onResolve";

const { posix: path } = nativePath;

const jsExtensions = new Set([".tsx", ".ts", ".jsx", ".js"]);
const cssExtensions = new Set([".scss", ".sass", ".css"]);

export async function configureEntrypoints(
    pluginData: PluginData,
    build: PluginBuild
): Promise<void> {
    build.initialOptions.entryPoints ??= [];

    const { entryPoints } = build.initialOptions;

    const entries = Array.isArray(entryPoints)
        ? entryPoints
        : Object.values(entryPoints);
    if (entries.length === 0) {
        throw new Error(
            `The plugin ${JSON.stringify(
                pluginData.pluginName
            )} currently requires configuring entrypoints, set them in your ESBuild configuration.`
        );
    }

    let jsEntry;
    let cssEntry;
    for (const entry of entries) {
        const { ext } = path.parse(normalize(entry));

        if (jsExtensions.has(ext)) {
            if (typeof jsEntry !== "undefined") {
                throw new Error(
                    `The plugin ${JSON.stringify(
                        pluginData.pluginName
                    )} does not currently support multiple entrypoints for JS or CSS.`
                );
            }

            jsEntry = entry;
        }

        if (cssExtensions.has(ext)) {
            if (typeof cssEntry !== "undefined") {
                throw new Error(
                    `The plugin ${JSON.stringify(
                        pluginData.pluginName
                    )} does not currently support multiple entrypoints for JS or CSS.`
                );
            }

            cssEntry = entry;
        }
    }
}
