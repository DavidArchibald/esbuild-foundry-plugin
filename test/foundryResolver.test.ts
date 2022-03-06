import { traversesUpDirectoryRegex } from "../src/foundryResolver";

describe("traversesUpDirectoryRegex", () => {
    const traversesUpDirectoryCases = [
        [`..\\`, "matches"],
        [`..\\/`, "matches"],
        [`./..///`, "matches"],

        [`../a/..`, "matches"],
        [`../a/../`, "matches"],
        [`././//..//b`, "matches"],

        // False positives
        [`./a/b/../..`, "false positive match"],
        [`./a/b\\../../`, "false positive match"],
        [`././a\\b/.\\..///../`, "false positive match"],

        // Malformed paths that could match if not careful
        [`..a`, "doesn't match"],
        [`./a/..\\.b`, "doesn't match"],
        [`./a/b/..\\..c`, "doesn't match"],
    ] as const;

    test.each(traversesUpDirectoryCases)(
        "given the path %p, expect %s",
        (path, descriptor) => {
            const result = traversesUpDirectoryRegex.test(path);

            const expectMatch =
                descriptor === "matches" ||
                descriptor === "false positive match";

            expect(result).toEqual(expectMatch);
        }
    );
});
