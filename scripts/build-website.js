import { stringify } from "lib0/json";
import { join } from "path";
import { build, DOCS_DIR, WEBSITE_DIR } from "./build-common.js";
import { extractBackolonDocs } from "./doc-extract.js";

await build({
    splitting: true,
    minify: true,
    entryPoints: {
        repl: join(WEBSITE_DIR, "repl.ts"),
        docs: join(WEBSITE_DIR, "docs.ts"),
    },
    outdir: join(DOCS_DIR, "js"),
    plugins: [{
        name: "DOCS_PLUGIN",
        setup(build) {
            build.onResolve({ filter: /^\$_DOCUMENTATION$/ }, _ => {
                return { path: "/", namespace: "DOCS" };
            });

            build.onLoad({ filter: /./, namespace: "DOCS" }, async () => {
                const extracted = extractBackolonDocs(await import("../dist/typedoc_output.json"));

                // could add all of the file names to the watch list here, but we don't use esbuild's watch mode
                // since this script is only run on demand or by nodemon, which is already watching all the files for changes
                return {
                    contents: stringify(extracted, null, 4),
                    loader: "json"
                };
            });
        }
    }],
});

console.log("JS Build OK");
