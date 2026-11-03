import plugin from "../src/plugin";
import { build } from "./build-common";

await build({
    target: "node",
    minify: true, // Must minify for the fs imports to be eliminated
    format: "cjs",
    entrypoints: ["src/index.ts"],
    naming: "[dir]/[name].cjs",
    outdir: "dist/",
    plugins: [
        plugin,
        {
            // fix for oven-sh/bun#29243
            name: "await-fix",
            setup(build) {
                build.onLoad(
                    { filter: /src\/stdlib\/index\.ts$/ },
                    async (args) => {
                        const text = await Bun.file(args.path).text();
                        var lines = text.split("\n");
                        lines = lines.map((line) =>
                            /CORE = parse/.test(line) ? "//" + line : line,
                        );
                        return {
                            contents: lines.join("\n"),
                            loader: "ts",
                        };
                    },
                );
            },
        },
    ],
});
console.log("Build for fuzzer OK");
