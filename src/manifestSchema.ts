import type { PackageType } from "./pluginData";

/**
 * @param fileName - The potential manifest to check.
 * @param packageType - The type of manifest to check against for or undefined for both.
 * @returns
 */
export function isManifestJSON(
    fileName: string,
    packageType: PackageType | undefined
): boolean {
    if (typeof packageType === "undefined" || packageType === "module") {
        if (fileName === "module.json") {
            return true;
        }
    }

    if (typeof packageType === "undefined" || packageType === "system") {
        return fileName === "system.json";
    }

    return false;
}

const dependencyProperties = {
    // Optional
    scripts: {
        type: "array",
        items: {
            type: "string",
        },
        description:
            "An array of JavaScript file paths which should be included whenever this module is being used. Each listed script path should be relative to the module root directory. All scripts which exist will be automatically included in the game session and loaded in their listed order.",
    },
    esmodules: {
        type: "array",
        items: {
            type: "string",
        },
        description:
            "In addition to including traditional JavaScript script files, you may also include JS files which use the newer ES6 modules specification. As with Scripts, this should be declared as an array. These files are identified separately in the manifest so they may be correctly loaded as a module rather than a script.",
    },
    styles: {
        type: "array",
        items: {
            type: "string",
        },
        description:
            "You can designate an array of CSS files which should be included in the game session whenever this module is used. Each listed stylesheet path should be relative to the module root directory. All stylesheets which exist will be automatically included in the game session and loaded in their listed order.",
    },
    packs: {
        type: "array",
        item: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                },
                label: {
                    type: "string",
                },
                system: {
                    type: "array",
                    item: {
                        type: "string",
                    },
                },
                path: {
                    type: "string",
                },
                entity: {
                    type: "string",
                },
            },
            required: ["name", "label", "system", "path", "entity"],
        },
        description: `Modules may come bundled with Compendium packs which include game content for various Entity types. Compendium packs are defined as objects which have their own internal metadata structure."`,
        example: [
            {
                name: "pack-name",
                label: "Pack Title",
                system: ["system-name"],
                path: "./packs/pack-name.db",
                entity: "Item",
            },
        ],
    },
    dependencies: {
        type: "array",
        item: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description:
                        "Dependency entries require the name attribute. If only a name is provided, additional details about the module will be discovered from the Foundry VTT website listing.",
                },
                type: {
                    type: "string",
                    description:
                        "The type attribute instructs FVTT that the dependency may be on a different type of module. By default dependencies are assumed to be module, so if you want to depend on a system or world you should be explicit.",
                    enum: ["module", "system", "world"],
                },
                manifest: {
                    type: "string",
                    description:
                        "The manifest attribute provides an explicit manifest url to be used for downloading the dependency. If a manifest is not provided, the dependency package must exist in the Foundry website directory.",
                },
            },
            required: ["name"],
        },
        description:
            "Modules can require other modules, systems, or worlds be installed to allow their use. If a module has been installed with dependencies, but its dependencies are missing, it cannot be enabled. Dependencies are defined as an array of objects.",
        example: [
            {
                name: "dice-so-nice",
                manifest:
                    "https://gitlab.com/riccisi/foundryvtt-dice-so-nice/raw/2.0.3/module/module.json",
            },
            {
                name: "dnd5e",
                type: "system",
            },
            {
                name: "kobold-cauldron",
                type: "world",
            },
            {
                name: "betternpcsheet5e",
            },
        ],
    },
    languages: {
        type: "array",
        item: {
            type: "object",
            properties: {
                lang: {
                    type: "string",
                    description: `A language code in lower-case letters, for example "en" for English. See https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes`,
                },
                name: {
                    type: "string",
                    description: `The formal and readable name for the language, for example "English".`,
                },
                path: {
                    type: "string",
                    description:
                        "A path relative to the root directory of the manifest where localization strings are provided in JSON format.",
                },
            },
            required: ["lang", "name", "path"],
        },
        description:
            "The game system may designate an array of languages specifications that it supports by default. Each element in the languages array is an object which defines the language tag, label, and path to its localization file. Please see the [Languages and Localization](https://foundryvtt.com/article/localization/) documentation page for details on language entries provided by a module.",
        example: [
            {
                lang: "en",
                name: "English",
                path: "lang/en.json",
            },
        ],
    },
};

export const module = {
    type: "object",
    properties: dependencyProperties,
};

export const system = {
    type: "object",
    properties: dependencyProperties,
};
