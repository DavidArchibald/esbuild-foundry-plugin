import fs from "fs";
import nativePath from "path";

import { pluginName, type FoundryPaths } from "./pluginData";
import { normalize } from "./onResolve";

const currentlyCompatibleWith = `This plugin, ${pluginName} is currently compatible with Foundry v9.`;

// Both included and excluded directories are included to provide good error messages for if an unknown directory shows up.
const publicIncludedDirectories = [
    "cards",
    "css",
    "fonts",
    "icons",
    "lang",
    "scripts",
    "sounds",
    "ui",
];
const publicExcludedDirectories = ["docs"];
const publicAllDirectories = [
    ...publicIncludedDirectories,
    ...publicExcludedDirectories,
];

const publicIncludedSet = new Set(publicIncludedDirectories);
const publicExcludedSet = new Set(publicExcludedDirectories);

// `.db` files within the worlds folder is forbidden by Foundry's express server.
// const forbiddenRegex = /worlds\/(.*)\.db/;

const nodeModulesInclude = [
    "handlebars/dist",
    "handlebars-intl/dist",
    "jquery/dist",
    "pixi.js/dist/browser",
    "pixi-particles/dist",
    "@pixi/graphics-smooth/dist",
    "simple-peer",
    "socket.io-client/dist",
    "tinymce",
];

export type EntryInfo = {
    destinationPath: string;
    parentDir: string;
    sourcePath: string;
    type: "directory" | "file";
};

/**
 * Retrieves a list of files and folders that are Foundry entries. Only files and folders put at the top level are retrieved to keep the file system calls minimal.
 */
export async function getFoundryRootDirEntries(
    foundryPaths: FoundryPaths
): Promise<EntryInfo[]> {
    const { appPath, dataPath } = foundryPaths;

    const appEntries = await getAppEntries(appPath);

    // These entries are extremely straight forward, whether file or folder they're included and at the top level.
    const dataDirEntries = await fs.promises.readdir(dataPath, {
        withFileTypes: true,
    });
    const dataEntries = dataDirEntries.map((d) =>
        getEntryInfo(dataPath, "", d)
    );

    return [...appEntries, ...dataEntries];
}

/**
 * @param sourceDir - The folder being read within a root Foundry folder
 * @param outputDir - The folder being output to
 */
function getEntryInfo(
    sourceDir: string,
    outputDir: string,
    entry: fs.Dirent
): EntryInfo {
    return {
        destinationPath: normalize(nativePath.join(outputDir, entry.name)),
        parentDir: normalize(sourceDir),
        sourcePath: normalize(nativePath.join(sourceDir, entry.name)),
        type: entry.isDirectory() ? "directory" : "file",
    };
}

async function getAppEntries(appPath: string): Promise<EntryInfo[]> {
    const publicEntries = await getAppPublicEntries(appPath);
    const nodeModulesEntries = await getAppNodeModulesEntries(appPath);

    return [...publicEntries, ...nodeModulesEntries];
}

async function getAppPublicEntries(appPath: string): Promise<EntryInfo[]> {
    const publicPath = nativePath.join(appPath, "public");

    const humanDirectories = humanizeList(
        publicAllDirectories.map((a) => JSON.stringify(a))
    );
    const expectedExactly = `The Foundry public folder in the configured location ${appPath} is expected to contain exactly the directories ${humanDirectories}. ${currentlyCompatibleWith}`;

    const ifExpected = (type: string): string =>
        `If this ${type} is expected, make sure the plugin is up to date and if it is, consider filing an issue with the plugin.`;

    const missingEntries = new Set(publicAllDirectories);
    const resultEntries = [];
    const publicEntries = await fs.promises.readdir(publicPath, {
        withFileTypes: true,
    });
    for (const publicEntry of publicEntries) {
        if (!publicEntry.isDirectory()) {
            throw new Error(
                `${expectedExactly}. Found unexpected file ${JSON.stringify(
                    publicEntry.name
                )}.\n${ifExpected("file")}`
            );
        }

        const directoryName = publicEntry.name;

        const includedDir = publicIncludedSet.has(directoryName);
        const excludedDir = publicExcludedSet.has(directoryName);

        if (!includedDir && !excludedDir) {
            throw new Error(
                `${expectedExactly}. Found unexpected directory ${JSON.stringify(
                    publicEntry.name
                )}.\n${ifExpected("folder")}`
            );
        }

        if (includedDir) {
            // directories within public are put at the top level.
            resultEntries.push(getEntryInfo(publicPath, "", publicEntry));
        }

        missingEntries.delete(directoryName);
    }

    return resultEntries;
}

async function getAppNodeModulesEntries(appPath: string): Promise<EntryInfo[]> {
    const resultEntries = [];

    for (const moduleName of nodeModulesInclude) {
        const modulePath = nativePath.join(appPath, "node_modules", moduleName);

        const moduleEntries = await fs.promises.readdir(modulePath, {
            withFileTypes: true,
        });

        // entries within node_modules are put in /scripts
        resultEntries.push(
            ...moduleEntries.map((entry) =>
                getEntryInfo(modulePath, "scripts", entry)
            )
        );
    }

    return resultEntries;
}

/**
 * @param items - the list to turn into the human way of expressing items, e.g. `x and y` or `x, y, and z`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function humanizeList(items: any[]) {
    switch (items.length) {
        case 0:
            return "";
        case 1:
            return items[0].toString();
        case 2:
            return `${items[0]} and ${items[1]}`;
        default: {
            const [mostItems, lastItem] = [
                items.slice(0, -1),
                items[items.length - 1],
            ];

            const mostItemsList = mostItems
                .map((item) => item.toString())
                .join(", ");
            return `${mostItemsList}, and ${lastItem}`;
        }
    }
}
