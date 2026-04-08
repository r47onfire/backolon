import { join } from "path";
import { build, DOCS_DIR, WEBSITE_DIR } from "./build-common";

await build({
    splitting: true,
    minify: true,
    entryPoints: {
        repl: join(WEBSITE_DIR, "repl.ts"),
        docs: join(WEBSITE_DIR, "docs.ts"),
    },
    outdir: join(DOCS_DIR, "js"),
});
console.log("JS Build OK");
