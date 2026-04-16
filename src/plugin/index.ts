import { BunPlugin } from "bun";
import { stringify } from "lib0/json";
import { compress } from "lz-string";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { NamespaceResolver, Resurrect } from "resurrect-esm";
import { LocationTrace } from "../errors";
import { Thing } from "../objects/thing";
import { parse } from "../parser/parse";

/**
 * [ESBuild](https://esbuild.github.io) or [Bun](https://bun.com) plugin that loads `.bk`
 * files as their Backolon AST (the result of calling {@link parse} on their contents).
 */
const plugin: BunPlugin = {
    name: "esbuild-plugin-backolon",
    setup(build) {
        build.onLoad({ filter: /\.bk$/ }, async args => {
            const { javascript } = convertAST(args.path);
            return {
                contents: javascript,
                loader: "js"
            }
        });
    },
};
export default plugin;

export * from "./env.d";

function convertAST(file: string) {
    const text = readFileSync(file, "utf8");
    const parsed = parse(text, new URL("frozen://" + relative(process.cwd(), file)));
    const stringified = new Resurrect({
        cleanup: true,
        resolver: new NamespaceResolver({
            Thing,
            LocationTrace,
        }),
    }).stringify(parsed);
    return {
        javascript: `import { Resurrect, NamespaceResolver } from "resurrect-esm";
import { decompress } from "lz-string";
import { Thing, LocationTrace } from "@r47onfire/backolon";

export const ast = /* @__PURE__ */ new Resurrect({
    cleanup: true,
    resolver: new NamespaceResolver({
        Thing,
        LocationTrace,
    }),
}).resurrect(decompress(${stringify(compress(stringified))}));
export default ast;
/*

${text.replaceAll("*/", "*)")}

*/
`,
    }
}
