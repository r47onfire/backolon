// @ts-check
import * as esbuild from "esbuild";
import { join } from "path";

const ROOT = import.meta.dir;
const WEBSITE_DIR = join(ROOT, "website");
const DOCS_DIR = join(ROOT, "docs");

await esbuild.build({
        bundle: true,
        splitting: true,
        minify: true,
        format: "esm",
        platform: "browser",
        target: "esnext",
        entryPoints: {
            repl: join(WEBSITE_DIR, "repl.ts"),
            docs: join(WEBSITE_DIR, "docs.ts"),
        },
        outdir: join(DOCS_DIR, "js"),
        sourcemap: true,
    });
console.log("JS Build OK");
