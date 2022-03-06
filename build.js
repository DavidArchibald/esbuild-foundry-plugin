import esbuild from "esbuild";
import { pnpPlugin } from "@yarnpkg/esbuild-plugin-pnp";
import { nodeExternalsPlugin } from "esbuild-node-externals";

const isWatch = process.env.WATCH === "true";

await esbuild.build({
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
    plugins: [pnpPlugin(), nodeExternalsPlugin()],
});
