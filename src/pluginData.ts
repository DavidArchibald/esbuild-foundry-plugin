import type { OnResolveResult } from "esbuild";

import { getFoundryDataPath, getFoundryAppPath } from "./foundryConfig";
import { FoundryResolver } from "./foundryResolver";

export const pluginName = "foundryResolve";

export type PackageType = "module" | "system";

export type Options = {
    /** The type of the Foundry package, "module" or "system". */
    packageType: PackageType;

    /** The name of the module or system. */
    packageName: string;

    /** Optional, allows fine grained control of how import resolving gets cached. By default every import gets cached. All options are relative to Foundry root. */
    cache?: CacheOptions;

    /** Paths to Foundry related information. Do not use this setting if you simply want to configure this for your own setup instead use the environment variables FOUNDRY_DATA_PATH and FOUNDRY_RESOURCES_APP_PATH. This is intended for consumers of the plugin that already know where Foundry is. */
    foundryPaths?: InputFoundryPaths;

    /** Whether to check Foundry related paths resolve or not. This means if your module imports a file such as `../modules/package/file.xyz` it must exist in the local file system. Checks all by default, set to `false` to disable all checks. */
    importData?: Imports;

    /** Optional, whether to display debug logs or not. */
    debug?: boolean;
};

// TODO: Implement. Probably also have as a watch mode option that controls how to watch for changes.
type CacheOptions = Partial<{
    /** Disables caching entirely if set to true. */
    disable: boolean;

    /** Defaults to true. Whether to cache files from Foundry's Data folder. This may be useful if you are working */
    disableFoundryDataCache: boolean;

    /** Defaults to true. Whether to cache files from resources/app in the Foundry folder installed. I am currently unsure of a use case for this because this is entirely Foundry controlled files. Unless the dependencies Foundry has are being changed you won't need this. It was easy to add though so it's here. */
    disableFoundryApp: boolean;

    /** A list of files and folders that are included. If not set every file is cached. */
    included: string[];

    /** A list of files and folders that are excluded from being cache. */
    excluded: string[];
}>;

type InputFoundryPaths = {
    /** The path to the data folder of Foundry which may be customized in the application. If not set this will be discovered automatically based upon platform, e.g. `~/.local/share/FoundryVTT` for Linux. Only in the case of discovering the system's default path will this attempt to read `Config/options.json` and discover the data path through the property `dataPath`. This is to mirror how Foundry searches for. */
    dataPath?: string;

    /** The path to the extracted zip of Foundry, e.g `~/FoundryVTT-9.249` which should contain a folders, important for us the "resources" folder. */
    appPath: string;
};

export type FoundryPaths = Required<InputFoundryPaths>;

type Imports = {
    /** Whether to check if Foundry related imports exist. */
    checkImportsExist: boolean;

    /** Whether to rewrite root imports to be relative ones or not. */
    rewriteRootImports: boolean;

    /** Additional root files and folders show they exist. */
    additionalRoot: AdditionalRoot;
};

type AdditionalRoot = {
    /** Additional globs expected to exist at Foundry's root */
    globs: string[];

    /** Exact files expected to exist at Foundry's root. */
    files: string[];
};

type Entrypoints = {
    js?: string;
    css?: string;
};

export type Log = (message?: string, ...optionalParams: unknown[]) => void;

export type PluginData = {
    packageType: PackageType;
    packageName: string;
    pluginName: string;
    entrypoints: Entrypoints;
    cacheOptions: CacheOptions;
    foundryPaths: InputFoundryPaths;
    imports: Imports;
    debug: boolean;

    projectRoot: string;
    outdir: string;
    resolver: FoundryResolver;
    onResolveCache: Record<string, Record<string, OnResolveResult | undefined>>;
    cachedManifest?: {
        manifestJSON: Record<string, unknown>;
        localImports: string[];
    };
    log: Log;
};

export function getPluginData(options: Options): PluginData {
    const { packageType, packageName, cache, importData, debug } = options;

    const {
        disable,
        disableFoundryDataCache,
        disableFoundryApp,
        included,
        excluded,
    } = cache ?? ({} as CacheOptions);

    const { checkImportsExist, rewriteRootImports, additionalRoot } =
        importData ?? {};
    const { globs, files } = additionalRoot ?? {};

    // eslint-disable-next-line no-console
    const log = debug ? console.log : () => {};

    const { dataPath, appPath } = options.foundryPaths ?? {};
    const foundryPaths = {
        dataPath: getFoundryDataPath(dataPath, log),
        appPath: getFoundryAppPath(appPath, log),

        ...(options.foundryPaths ?? {}),
    };

    const resolver = new FoundryResolver();

    return {
        packageType,
        packageName,
        pluginName,
        projectRoot: "",
        entrypoints: {},
        cacheOptions: {
            disable: !!disable,
            disableFoundryDataCache: !!disable || !!disableFoundryDataCache,
            disableFoundryApp: !!disable || !!disableFoundryApp,
            included: included ?? [],
            excluded: excluded ?? [],
        },
        onResolveCache: {},
        imports: {
            checkImportsExist: !!checkImportsExist,
            rewriteRootImports: !!rewriteRootImports,
            additionalRoot: {
                globs: globs ?? [],
                files: files ?? [],
            },
        },
        foundryPaths,
        outdir: "",
        resolver,
        debug: !!debug,
        log,
    };
}
