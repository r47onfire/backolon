import { build } from "./build-common.js";

await build({
    splitting: true,
    outdir: "dist/",
    entryPoints: {
        "backolon": "src/index.ts",
        "backolon-esbuild-plugin": "src/esbuildPlugin/index.ts",
    },
    minify: process.argv.includes('--minify'),
    external: ["node:fs", "node:path"],
});
console.log("Build OK");
