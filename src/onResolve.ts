import type {
    OnResolveArgs,
    OnResolveResult,
    OnLoadArgs,
    OnLoadResult,
} from "esbuild";
import nativePath, { posix as path } from "path";
import type { PluginData } from "./pluginData";

// Built for only POSIX normalized paths.
const normalizedTraversesUpRegex = /\.\.(\/+|$)/;

export function cachedResolve(
    pluginData: PluginData,
    callback: (
        args: OnResolveArgs
    ) => OnResolveResult | undefined | Promise<OnResolveResult | undefined>
) {
    return async (args: OnResolveArgs) => {
        const importer = normalize(args.importer);
        const importPath = normalize(args.path);

        pluginData.onResolveCache[importer] ??= {};

        const cachedResult = pluginData.onResolveCache[importer][importPath];
        if (cachedResult != null) {
            return cachedResult;
        }

        const callbackResult = await callback(args);
        pluginData.onResolveCache[importer][importPath] = callbackResult;

        return callbackResult;
    };
}

export function onResolveTraversesUp(
    pluginData: PluginData,
    args: OnResolveArgs
): OnResolveResult | undefined {
    const { log } = pluginData;

    const { importerDir, importPath } = getImportData(args, pluginData);

    // Handles the pathological case `./a/b/../..` matched by the Regex but now that it's normalized it's clear it's not actually going up any directories.
    if (!normalizedTraversesUpRegex.test(importPath)) {
        log("Import is pathological import");

        return undefined;
    }

    const importRelativeToRoot = path.join(importerDir, importPath);

    // If the import DOESN'T traverse out of the project root, this indicates the file is local and can be handled by ESBuild.
    if (!normalizedTraversesUpRegex.test(importRelativeToRoot)) {
        log("Import is within project root.");

        return undefined;
    }

    const packagePath = path.join(
        `${pluginData.packageType}s`,
        pluginData.packageName
    );

    // Constructs the final path of the importer directory in Foundry
    // e.g. `modules/lorem/scripts/foo/`
    const foundryImporterPath = path.join(packagePath, importerDir);

    const resolvesTo = path.join(foundryImporterPath, importPath);

    // An import can go back into the current package or system.
    // For example if the current package is a module named foo and the import resolves like `modules/foo/bar/lorem.js`, the path `bar/lorem.js` should exist relative to the project root.
    if (resolvesTo.startsWith(packagePath)) {
        // If the import points back to the current package, find it locally.
        const projectRootRelative = path.relative(resolvesTo, packagePath);

        const outputData = {
            path: path.join(pluginData.projectRoot, projectRootRelative),
            namespace: "file",
        };

        log("Foundry relative, imports own package, output:", outputData);

        return outputData;
    }

    // Other Foundry imports are "external", Foundry provides them so we don't bundle them.
    const outputData = getFoundryImport(args, path.join(resolvesTo));

    log("Foundry relative import, output:", outputData);

    return outputData;
}

export function onResolveAbsolute(
    pluginData: PluginData,
    args: OnResolveArgs
): OnResolveResult | undefined {
    const { pluginName, log } = pluginData;

    const { base: importFile, dir: importDir } = nativePath.parse(
        normalize(args.path)
    );
    if (
        args.kind === "entry-point" &&
        importFile === "module.json" &&
        importDir === pluginData.projectRoot
    ) {
        return undefined;
    }

    const { importPath } = getImportData(args, pluginData);

    if (!pluginData.imports.rewriteRootImports) {
        return {
            errors: [
                {
                    pluginName,
                    text: "Rewriting root imports is not enabled!",
                    detail: "Consider setting `options.imports.rewriteRootImports` to true in the plugin configuration if you would like root imports to be rewritten as relative imports.",
                },
            ],
        };
    }

    // getFoundry import expects a path relative to Foundry's root.
    // We can provide that by making this root path relative.
    const output = getFoundryImport(args, path.join(".", importPath));

    log("Rewrote absolute path:", output);

    return output;
}

type ImportData = { importerDir: string; importPath: string };

function getImportData(
    args: OnResolveArgs,
    pluginData: PluginData
): ImportData {
    const { log } = pluginData;

    const { resolveDir } = args;

    // The importer relative to the project, for example:
    // pluginData.projectRoot = "/path/to/project"
    // args.resolveDir = "/path/to/project/scripts/foo"
    // importerDir = "scripts/foo"
    const importerDir = normalize(
        nativePath.relative(pluginData.projectRoot, resolveDir)
    );

    if (normalizedTraversesUpRegex.test(importerDir)) {
        throw new Error(
            `Got an importer directory ${JSON.stringify(
                resolveDir
            )} which lies outside of the configured project root ${JSON.stringify(
                pluginData.projectRoot
            )}.`
        );
    }

    const importerFile = path.parse(args.importer).base;
    const importer =
        importerFile === ""
            ? `directory ${JSON.stringify(importerDir)}`
            : JSON.stringify(path.join(importerDir, importerFile));

    log(`\nImport from ${importer} is ${JSON.stringify(args.path)}`);

    const importPath = normalize(args.path);

    return {
        importerDir,
        importPath,
    };
}

/**
 * normalize does the same thing as path.normalize but additionally makes sure the output is a POSIX path. This allows us to use `/` as the definitive path seperator and makes code less awkward.
 *
 * @param p - string path to normalize.
 */
export function normalize(p: string) {
    const normalizedPath = nativePath.normalize(p);

    return normalizedPath.split(nativePath.sep).join("/");
}

function getFoundryImport(
    args: OnResolveArgs,
    foundryRootRelative: string
): OnResolveResult {
    // TODO: Actually check if the file exists in Foundry.
    // require-call and require-resolve omitted due to ESM requirements.
    if (args.kind === "import-statement" || args.kind === "dynamic-import") {
        return {
            namespace: "foundry-import",
            pluginData: {
                foundryImport: foundryRootRelative,
                // resolveArgs: args,
            },
        };
    }

    return {
        path: args.path,
        external: true,
    };
}

export function onLoadFoundryImport(args: OnLoadArgs): OnLoadResult {
    const foundryImport = args.pluginData.foundryImport as string;

    return {
        contents: `export default await import(getRoute(${JSON.stringify(
            foundryImport
        )}))`,
        loader: "js",
    };
}
