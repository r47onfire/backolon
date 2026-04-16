import plugin from "../src/plugin";
import { build } from "./build-common";

await build({
    splitting: true,
    outdir: "dist/",
    entrypoints: ["src/index.ts", "src/plugin/index.ts"],
    naming: {
        entry: "[dir]/[name].[ext]",
        chunk: "[dir]/[hash].[ext]",
    },
    minify: process.argv.includes('--minify'),
    external: ["node:fs", "node:path"],
    plugins: [plugin],
    target: "node",
});
console.log("Build OK");
