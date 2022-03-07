import type {
    OnResolveArgs,
    OnResolveResult,
    OnLoadArgs,
    OnLoadResult,
} from "esbuild";
import nativePath from "path";
import fs from "fs";

import type { PluginData } from "./pluginData";
import { normalize } from "./onResolve";

export function onResolveTemplates(args: OnResolveArgs): OnResolveResult {
    const resolvedPath = normalize(nativePath.join(args.resolveDir, args.path));

    return {
        path: resolvedPath,
        watchFiles: [resolvedPath],
        namespace: "foundry-template",
        pluginData: {
            resolveArgs: args,
        },
    };
}

export async function onLoadTemplates(
    pluginData: PluginData,
    args: OnLoadArgs
): Promise<OnLoadResult> {
    const resolveArgs = args.pluginData.resolveArgs as OnResolveArgs;

    const rootRelative = nativePath.relative(pluginData.projectRoot, args.path);

    const outputPath = nativePath.join(pluginData.outdir, rootRelative);
    const outDir = nativePath.parse(outputPath).dir;

    await fs.promises.mkdir(outDir, { recursive: true });

    await fs.promises.copyFile(
        nativePath.join(pluginData.projectRoot, rootRelative),
        nativePath.join(pluginData.outdir, rootRelative)
    );

    const relativeResolveDir = nativePath.relative(
        pluginData.projectRoot,
        resolveArgs.resolveDir
    );

    const foundryPath = normalize(
        nativePath.join(
            `${pluginData.packageType}s`,
            pluginData.packageName,
            relativeResolveDir,
            resolveArgs.path
        )
    );

    return {
        contents: `export default ${JSON.stringify(foundryPath)};`,
        loader: "js",
    };
}
