import { BunPlugin } from "bun";

/**
 * [ESBuild](https://esbuild.github.io) or [Bun](https://bun.com) plugin that
 * loads `.bk` files as their Backolon AST.
 */
const plugin: BunPlugin = {
    name: "esbuild-plugin-backolon",
    setup(build) {
        // build.onLoad({ filter: /\.bk$/ }, args => {
        //     const javascript = convertAST(args.path);
        //     return {
        //         contents: javascript,
        //         loader: "text"
        //     }
        // });
    },
};
export default plugin;

// function convertAST(file: string) {
//     const text = readFileSync(file, "utf8");
//     const parsed = tokenize(text, new URL("frozen://" + relative(process.cwd(), file)));
//     const stringified = new Resurrect({
//         cleanup: true,
//         resolver: new NamespaceResolver({
//         }),
//     }).stringify(parsed);
//     return `import { Resurrect, NamespaceResolver } from "resurrect-esm";
// import { decompress } from "lz-string";

// /*

// ${text.replaceAll("*/", "*)")}

// */
// export const source = /* @__PURE__ */ decompress(
//     ${stringify(compress(text))}
// );

// export const ast = /* @__PURE__ */ new Resurrect({
//     cleanup: true
// }).resurrect(decompress(
//     ${stringify(compress(stringified))}
// ));
// export default ast;
// `
// }
