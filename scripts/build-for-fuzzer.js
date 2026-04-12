import { build } from "./build-common.js";

await build({
    platform: "node",
    format: "cjs",
    entryPoints: { "backolon": "src/index.ts" },
    outExtension: { ".js": ".cjs" },
    outdir: "dist/",
});
console.log("Build for fuzzer OK");