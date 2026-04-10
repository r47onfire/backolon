import * as esbuild from "esbuild";
import { join } from "path";

export const ROOT = join(import.meta.dir, "..");

export const WEBSITE_DIR = join(ROOT, "website");
export const DOCS_DIR = join(ROOT, "docs");

export async function build(options) {
    await esbuild.build({
        bundle: true,
        sourcemap: true,
        platform: "browser",
        target: "esnext",
        format: "esm",
        ...options,
    });
}
