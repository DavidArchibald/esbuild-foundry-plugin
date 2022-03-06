/* eslint-disable @typescript-eslint/no-var-requires */

const esbuild = require("esbuild");
const { nodeExternalsPlugin } = require("esbuild-node-externals");

const isWatch = process.env.WATCH === "true";

esbuild.build({
    entryPoints: ["src/index.ts"],
    outbase: "src",
    outdir: "dist",
    bundle: true,
    sourcemap: true,
    minify: true,
    incremental: isWatch,
    watch: isWatch,
    format: "cjs",
    platform: "node",
    plugins: [nodeExternalsPlugin()],
});
