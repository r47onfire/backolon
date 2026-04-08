import { build } from "./build-common";

await build({
    entryPoints: ["src/index.ts"],
    outfile: "dist/backolon.js",
    minify: process.argv.includes('--minify'),
});
console.log("Build OK");
