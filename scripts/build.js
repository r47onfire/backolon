import { build } from "./build-common.js";

await build({
    entryPoints: ["src/index.ts"],
    outfile: "dist/backolon.js",
    minify: process.argv.includes('--minify'),
});
console.log("Build OK");
