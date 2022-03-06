import nativePath from "path";
import type { Plugin, BuildOptions } from "esbuild";

import {
    getPluginData,
    pluginName,
    type Options,
    type PluginData,
} from "./pluginData";
import {
    onResolveTraversesUp,
    onResolveAbsolute,
    cachedResolve,
} from "./onResolve";
import { configureEntrypoints } from "./entrypoints";
import { createManifest, setupManifest } from "./foundryManifest";
import { traversesUpDirectoryRegex } from "./foundryResolver";

export const foundryPlugin = (options: Options): Plugin => {
    const pluginData = getPluginData(options);

    return {
        name: pluginName,
        async setup(build) {
            configureOptions(pluginData, build.initialOptions);
            await configureEntrypoints(pluginData, build);

            const { log } = pluginData;

            log("Build with options:", build.initialOptions);

            // Foundry will put your code within the path `$ROUTE_PREFIX/modules/<name>` or `$ROUTE_PREFIX/systems/<name>`, this means to access other other Foundry files all (normalized) imports must traverse up at least one directory.
            build.onResolve(
                { filter: traversesUpDirectoryRegex },
                cachedResolve(pluginData, (args) =>
                    onResolveTraversesUp(pluginData, args)
                )
            );

            log(
                "Rewriting absolute imports enabled:",
                pluginData.imports.rewriteRootImports,
                "\n"
            );

            // Alternatively you can use an absolute path import but this assumes `$ROUTE_PREFIX` is empty and so should be considered an anti-pattern as importing this way will break if `$ROUTE_PREFIX` is set.
            // This is why absolute path imports are optional.
            // While absolute paths on Windows could start with something like `C:/` we don't care about that here because that's definitely not a valid Foundry import.
            build.onResolve(
                { filter: /^[/\\]/ },
                cachedResolve(pluginData, (args) =>
                    onResolveAbsolute(pluginData, args)
                )
            );

            build.onStart(() => setupManifest(pluginData, build));

            // We setup the manifest on start but unfortunately it has files it'd like to watch but just can't within onStart. We get around this hackily by using the first entrypoint and giving it the files to watch there.

            build.onEnd((result) => createManifest(pluginData, build, result));
        },
    };
};

function configureOptions(pluginData: PluginData, options: BuildOptions): void {
    const { log } = pluginData;
    if (typeof options.format === "undefined") {
        options.format = "esm";
        log('Automatically setting format to "esm".');
    }

    if (options.format !== "esm") {
        throw new Error(
            `Formats besides "esm" are currently not possible in plugin ${JSON.stringify(
                pluginData.pluginName
            )}. The "esm" format is required in order to bundle correctly.`
        );
    }

    if (typeof options.metafile === "undefined") {
        options.metafile = true;
        log("Automatically setting metafile to true.");
    }

    if (options.metafile !== true) {
        throw new Error(
            `The plugin ${JSON.stringify(
                pluginData.pluginName
            )} requires a metafile in order to track where files go.`
        );
    }

    if (typeof options.outbase === "undefined") {
        throw new Error(
            `The outbase option must be defined in order for the ${JSON.stringify(
                pluginData.pluginName
            )} plugin to locate the location in which imports come from.`
        );
    }

    pluginData.projectRoot = options.outbase;

    if (typeof options.outdir === "undefined") {
        throw new Error(
            `The outdir option must be defined in order for the ${JSON.stringify(
                pluginData.pluginName
            )} plugin to locate where to put imports.`
        );
    }

    pluginData.outdir = nativePath.resolve(options.outdir);
}
