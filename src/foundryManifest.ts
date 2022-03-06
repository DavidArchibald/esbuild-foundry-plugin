import fs from "fs";
import { Validator } from "jsonschema";
import nativePath from "path";
import type {
    PluginBuild,
    OnStartResult,
    ResolveResult,
    BuildResult,
    Metafile,
} from "esbuild";

import type { PluginData } from "./pluginData";
import { normalize } from "./onResolve";
import * as manifestSchema from "./manifestSchema";

const { posix: path } = nativePath;

async function validateManifest(
    pluginData: PluginData,
    manifestJSON: string
): Promise<void> {
    const validator = new Validator();

    let schema;
    if (pluginData.packageType === "module") {
        schema = manifestSchema.module;
    } else {
        schema = manifestSchema.system;
    }

    validator.validate(manifestJSON, schema, { throwAll: true });
}

export async function setupManifest(
    pluginData: PluginData,
    build: PluginBuild
): Promise<OnStartResult | undefined> {
    // Unfortunately as ESBuild is as of writing we have to completely handle copying over files ourselves.
    // We also have to take over watching because it's just not going to rebuild otherwise.

    const { manifestJSON, errors, localImports } = await getManifest(
        pluginData,
        build
    );
    if (typeof errors !== "undefined" && errors.length !== 0) {
        return {
            errors,
        };
    }

    if (pluginData.cachedManifest == null) {
        pluginData.cachedManifest = {
            manifestJSON,
            localImports,
        };
    }

    return undefined;
}

type ManifestData = {
    errors: OnStartResult["errors"];
    manifestJSON: Record<string, unknown>;
    localImports: string[];
};

async function getManifest(
    pluginData: PluginData,
    build: PluginBuild
): Promise<ManifestData> {
    const manifestFile = `${pluginData.packageType}.json`;
    const manifestPath = path.join(pluginData.projectRoot, manifestFile);

    const manifestContents = await fs.promises.readFile(manifestPath, "utf-8");
    const manifestJSON = JSON.parse(manifestContents);

    await validateManifest(pluginData, manifestJSON);

    return await normalizeManifest(pluginData, build, manifestJSON);
}

type ManifestJSON = Record<string, unknown>;

type NormalizeManifestResult = {
    errors: OnStartResult["errors"];
    manifestJSON: ManifestJSON;
    localImports: string[];
};

async function normalizeManifest(
    pluginData: PluginData,
    build: PluginBuild,
    manifestJSON: ManifestJSON
): Promise<NormalizeManifestResult> {
    const { log } = pluginData;

    const manifestFile = `${pluginData.packageType}.json`;

    // Imports exist like `"scripts": ["path/to/script", ...]` or `"packs": [{ "path": "path/to/pack" }, ...]`
    // Accommodating both is a bit ugly unfortunately.

    const errors: OnStartResult["errors"] = [];
    const localImports: string[] = [];

    updateManifestImports(manifestJSON, async (keyPath, importPath) => {
        log(
            `\nImport from ${JSON.stringify(
                manifestFile
            )} from property ${JSON.stringify(keyPath)} is ${JSON.stringify(
                importPath
            )}`
        );

        const {
            path: resolvedPath,
            errors: innerErrors,
            localImport,
        } = await resolveManifestImport(pluginData, build, importPath, keyPath);
        if (innerErrors.length !== 0) {
            errors.push(...innerErrors);
        }

        if (localImport) {
            localImports.push(resolvedPath);
        }

        log("Resolved to:", resolvedPath);

        return resolvedPath;
    });

    return { errors, manifestJSON, localImports };
}

type ForEachCallback = (
    keyPath: string,
    importPath: string,
    manifestKey: string,
    index: number,
    isPathObj: boolean
) => unknown | undefined;

type FirstTwo<T extends unknown[]> = T extends [
    infer One,
    infer Two,
    ...unknown[]
]
    ? [One, Two]
    : never;

type UpdateManifestCallback = (
    ...args: FirstTwo<Parameters<ForEachCallback>>
) => ReturnType<ForEachCallback>;

/**
 * @param callback - Returning undefined deletes the item. Returning another value will replace its path.
 */
async function updateManifestImports(
    manifestJSON: ManifestJSON,
    callback: UpdateManifestCallback
) {
    await forEachManifestImports(
        manifestJSON,
        async (keyPath, importPath, manifestKey, i, isPathObj) => {
            const importArr = manifestJSON[manifestKey] as unknown[];
            const resultPath = await callback(keyPath, importPath);

            if (typeof resultPath === "undefined") {
                delete importArr[i];

                return;
            }

            if (isPathObj) {
                (importArr[i] as { path: unknown }).path = resultPath;
            } else {
                importArr[i] = resultPath;
            }
        }
    );
}

const manifestImports: { [manifestKey: string]: boolean } = {
    scripts: false,
    esmodules: false,
    styles: false,
    packs: true,
    languages: true,
};

async function forEachManifestImports(
    manifestJSON: ManifestJSON,
    callback: ForEachCallback
) {
    for (const [manifestKey, isPathObj] of Object.entries(manifestImports)) {
        const importArr = manifestJSON[manifestKey] as unknown[];
        for (const [i, importsItem] of Object.entries(importArr)) {
            const importPath = isPathObj
                ? (importsItem as { path?: string } | undefined)?.path
                : (importsItem as string | undefined);

            if (typeof importPath === "undefined") {
                continue;
            }

            // Gets the way the property would be accessed most directly as a string like `scripts[2]` or `languages[4].path`
            const keyPath = `${manifestKey}[${i}]${isPathObj ? `.path` : ""}`;

            await callback(
                keyPath,
                importPath,
                manifestKey,
                parseInt(i, 10),
                isPathObj
            );
        }
    }
}

/**
 * Imports from a manifest are special, they first attempt to import relative to the project and then against `../scripts`. This happens even outside of esmodules and scripts but NOT within packs.
 */
async function resolveManifestImport(
    pluginData: PluginData,
    build: PluginBuild,
    manifestImport: string,
    keyPath: string
): Promise<ResolveResult & { localImport: boolean }> {
    const { log } = pluginData;

    const manifestFile = `${pluginData.packageType}.json`;

    const normalizedPath = normalize(manifestImport);

    // Paths won't be resolved against the filesystem unless `./` is at the beginning.
    // However normalization removes `./` at the beginning and imports aren't required to have them, so we add it back here.
    // See https://esbuild.github.io/plugins/#resolve for further information.
    const relativeImportData = await build.resolve(`./${normalizedPath}`, {
        resolveDir: pluginData.projectRoot,
    });

    if (relativeImportData.errors.length === 0) {
        return {
            ...relativeImportData,
            localImport: true,
            path: normalizedPath,
        };
    }

    log("Not relative to project root", pluginData.projectRoot);

    const scriptsImportData = await build.resolve(
        path.join("../../scripts", manifestImport),
        {
            resolveDir: pluginData.projectRoot,
        }
    );

    if (keyPath.startsWith("packs")) {
        const foundryPacksBugDetails =
            scriptsImportData.errors.length === 0
                ? ` This import seems to exist within Foundry's "scripts" directory on Foundry servers. Unlike every other manifest import "packs" do not try to resolve within the "scripts" directory.`
                : "";

        const resolveError = {
            detail: `The import in ${JSON.stringify(
                manifestFile
            )} at ${JSON.stringify(keyPath)}, ${JSON.stringify(
                manifestImport
            )} does not exist as a relative path.${foundryPacksBugDetails}`,
            location: null,
            notes: [],
            pluginName: pluginData.pluginName,
            text: `Could not resolve ${JSON.stringify(manifestImport)}`,
        };

        return {
            ...relativeImportData,
            localImport: false,
            errors: [resolveError],
        };
    }

    if (scriptsImportData.errors.length !== 0) {
        const resolveError = {
            detail: `The import in ${JSON.stringify(
                manifestFile
            )} at ${JSON.stringify(keyPath)}, ${JSON.stringify(
                manifestImport
            )} could not resolve as a relative path or within the "scripts" directory on Foundry servers.`,
            location: null,
            notes: [],
            pluginName: pluginData.pluginName,
            text: `Could not resolve ${JSON.stringify(manifestImport)}`,
        };

        return {
            ...scriptsImportData,
            localImport: false,
            errors: [resolveError],
        };
    }

    return {
        ...scriptsImportData,
        path: normalizedPath,
        localImport: false,
    };
}

export async function createManifest(
    pluginData: PluginData,
    _build: PluginBuild,
    result: BuildResult
): Promise<void> {
    const { manifestJSON, localImports } = pluginData.cachedManifest ?? {};

    const { metafile } = result;

    const inputsToOutputs = getInputsToOutputs(pluginData, metafile);

    const outputs: Record<string, string> = {};
    const localImportsSet = new Set(localImports);

    const finalManifest = JSON.parse(JSON.stringify(manifestJSON));
    forEachManifestImports(
        finalManifest,
        async (_keyPath, importPath, manifestKey, index, isPathObj) => {
            const importArr = finalManifest[manifestKey];
            const esbuildOutput = inputsToOutputs[importPath];

            // ESBuild has no info for us.
            if (typeof esbuildOutput === "undefined") {
                if (localImportsSet.has(importPath)) {
                    const outDir = nativePath.parse(
                        nativePath.join(pluginData.outdir, importPath)
                    ).dir;

                    await fs.promises.mkdir(outDir, { recursive: true });

                    await fs.promises.copyFile(
                        nativePath.join(pluginData.projectRoot, importPath),
                        nativePath.join(pluginData.outdir, importPath)
                    );
                }

                return;
            }

            const [outputPath] = esbuildOutput;
            const otherImport = outputs[outputPath];

            if (typeof otherImport !== "undefined") {
                if (isPathObj) {
                    throw new Error(
                        `Found two imports ${JSON.stringify(
                            otherImport
                        )} and ${JSON.stringify(
                            importPath
                        )} that get bundled to ${JSON.stringify(
                            outputPath
                        )}. As this is within the ${manifestKey} manifest property this most indicates error as bundling packs or languages files together will produce undesirable results.`
                    );
                }

                // Delete the current entry because it's been bundled with an existing entrypoint.
                delete importArr[index];
            }

            // Update the path.
            if (isPathObj) {
                importArr[index].path = outputPath;
            } else {
                importArr[index] = outputPath;
            }

            outputs[outputPath] = importPath;
        }
    );

    const outputPath = nativePath.join(
        pluginData.outdir,
        `${pluginData.packageType}.json`
    );

    await fs.promises.writeFile(
        outputPath,
        JSON.stringify(finalManifest, null, 4),
        "utf-8"
    );
}
type InputsToOutputs = {
    [inputPath: string]: [
        outputPath: string,
        outputData: Metafile["outputs"] extends Record<string, infer V>
            ? V
            : never
    ];
};

function getInputsToOutputs(
    pluginData: PluginData,
    metafile?: Metafile
): InputsToOutputs {
    const inputsToOutputs: InputsToOutputs = {};
    if (typeof metafile === "undefined") {
        return inputsToOutputs;
    }

    // Inputs and outputs are prefixed with the source directory and output root correspondingly while our logic doesn't want it so we remove it here.
    const relativeProject = path.relative(
        path.resolve("."),
        pluginData.projectRoot
    );
    const relativeOutput = path.relative(path.resolve("."), pluginData.outdir);
    for (const [outputPath, output] of Object.entries(metafile.outputs)) {
        const outputRelative = path.relative(relativeOutput, outputPath);

        for (const inputPath of Object.keys(output.inputs)) {
            const sourceRelative = path.relative(relativeProject, inputPath);

            inputsToOutputs[sourceRelative] = [outputRelative, output];
        }
    }

    return inputsToOutputs;
}
