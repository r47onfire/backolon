import { build } from "./build-common";

await build({
    platform: "node",
    format: "cjs",
    entryPoints: ["src/index.ts"],
    outfile: "dist/backolon.cjs",
});
console.log("Build for fuzzer OK");