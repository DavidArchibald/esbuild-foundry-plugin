import nativePath from "path";

import os from "os";
import fs from "fs";

import { type Log, pluginName } from "./pluginData";
import { normalize } from "./onResolve";

const { posix: path } = nativePath;

const FOUNDRY_VTT_RESOURCES_PATH = "FOUNDRY_VTT_RESOURCES_PATH";
const FOUNDRY_VTT_DATA_PATH = "FOUNDRY_VTT_DATA_PATH";

const foundryConfigurationExplanation = `The ${pluginName} plugin requires an instance of Foundry to exist for resolving files for the version of Foundry being developed against.`;

export function getFoundryDataPath(
    configuredPath: string | undefined,
    log: Log
): string {
    if (configuredPath != null) {
        validateFoundryPath(
            configuredPath,
            "the location given as an option",
            "This indicates the user of the plugin has made a mistake."
        );

        log("Using configured Foundry data path:", configuredPath);

        return configuredPath;
    }

    let foundryPath: string = process.env[FOUNDRY_VTT_DATA_PATH] ?? "";
    const useDefaultPath = foundryPath === "";

    let scenario;
    let hint;
    const simpleHint = `Check to see if you have misconfigured the location of Foundry.`;
    if (useDefaultPath) {
        foundryPath = getDefaultFoundryDataPath();

        scenario = `the default location for the current platform ${process.platform}`;
        hint = `Make sure you have a version of Foundry set up. If you have Foundry installed outside of the default location, you can set the ${JSON.stringify(
            FOUNDRY_VTT_DATA_PATH
        )} environment variable to its path. This will additionally allow Foundry to discover the location of your data.`;
    } else {
        scenario = `the path configured with the ${JSON.stringify(
            FOUNDRY_VTT_DATA_PATH
        )} environment variable`;
        hint = simpleHint;
    }

    validateFoundryPath(foundryPath, scenario, hint);

    if (useDefaultPath) {
        const optionsPath = path.join(foundryPath, "Config", "options.json");
        const optionsDataPath = JSON.parse(
            fs.readFileSync(optionsPath, "utf8")
        )?.dataPath;

        if (
            typeof optionsDataPath === "string" &&
            optionsDataPath !== "" &&
            normalize(optionsDataPath) !== normalize(foundryPath)
        ) {
            scenario = `dataPath within "Config/options.json" in ${scenario}`;
            hint = simpleHint;

            foundryPath = optionsDataPath;

            validateFoundryPath(foundryPath, scenario, hint);
        }
    }

    log(`Found ${scenario}: ${JSON.stringify(foundryPath)}.`);

    return foundryPath;
}

/**
 *
 * @param foundryPath - The path to validate.
 * @param scenario - The scenario the path is coming from in a human readable form.
 * @param hint - The hint for what to do to fix it.
 */
function validateFoundryPath(
    foundryPath: string,
    scenario: string,
    hint: string
): void {
    if (!fs.existsSync(foundryPath)) {
        throw new Error(
            `Expected the path ${foundryPath} from ${scenario} to exist. ${hint}`
        );
    }

    const dataPath = path.join(foundryPath, "Data");
    if (!fs.existsSync(dataPath)) {
        throw new Error(
            `Expected the path ${foundryPath} from ${scenario} to contain a "Data" folder. ${hint}`
        );
    }
}

function getDefaultFoundryDataPath() {
    const homeDir = os.homedir();
    const foundryVTT = "FoundryVTT";

    switch (process.platform) {
        case "win32":
            return path.join(
                process.env.LOCALAPPDATA || path.join(homeDir, "AppData/Local"),
                foundryVTT
            );
        case "darwin":
            return path.join(
                homeDir,
                "Library/Application Support",
                foundryVTT
            );
        default: {
            let otherRoot =
                process.env.XDG_DATA_HOME || path.join(homeDir, ".local/share");
            if (!fs.existsSync(otherRoot)) {
                otherRoot = "/local";
            }

            return path.join(otherRoot, foundryVTT);
        }
    }
}

export function getFoundryAppPath(
    configuredPath: string | undefined,
    _log: Log
): string {
    if (configuredPath != null) {
        if (fs.existsSync(configuredPath)) {
            return configuredPath;
        }

        throw new Error(
            `The provided path ${JSON.stringify(
                configuredPath
            )} does not exist!`
        );
    }

    const foundryResourcePath = process.env[FOUNDRY_VTT_RESOURCES_PATH];

    if (foundryResourcePath === undefined) {
        throw new Error(
            `${foundryConfigurationExplanation} Set the ${FOUNDRY_VTT_RESOURCES_PATH} environment variable to allow the plugin to find resources you can import.`
        );
    }

    if (!fs.existsSync(foundryResourcePath)) {
        throw new Error(
            `The path configured with the ${FOUNDRY_VTT_RESOURCES_PATH} environment variable ${JSON.stringify(
                foundryResourcePath
            )} does not exist.`
        );
    }

    return path.join(foundryResourcePath, "resources", "app");
}
