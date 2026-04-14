import { stringify } from "lib0/json";
import { parse } from "node-html-parser";
import plugin from "../src/plugin";
import { renderMarkdown } from "../website_common/rendering";
import { build } from "./build-common.js";
import { extractBackolonDocs } from "./doc-extract";
import { docsToHTML } from "./build-docs";

function dedent(str: string) {
    str = str.replace(/^(\s*)\n/, "");
    const match = str.match(/^[^\S\r\n]+/);
    const unIndented = match ? str.replace(new RegExp("^" + match[0], "gm"), "") : str;
    // console.log("indented", str);
    // console.log("unindented", unIndented);
    return unIndented;
}

function markdown(html: HTMLElement) {
    const elsWithMarkdown = html.querySelectorAll("[markdown]");
    for (var el of elsWithMarkdown) {
        const html2 = dedent(el.innerHTML);
        if (parse(html2).querySelector("[markdown]")) throw new Error("nested [markdown] attributes are buggy af");
        el.innerHTML = renderMarkdown(html2, el.getAttribute("markdown") as any);
        el.removeAttribute("markdown");
    }
}

await build({
    splitting: true,
    minify: true,
    entrypoints: [
        "website/index.html",
        "website/repl/index.html",
        "website/docs/index.html",
    ],
    outdir: "./docs",
    naming: {
        entry: "[dir]/[name].[ext]",
        chunk: "[dir]/[hash].[ext]",
        asset: "[dir]/[hash].[ext]",
    },
    plugins: [
        plugin,
        {
            name: "SQUELCH_REQUIRE_JQUERY",
            setup(build) {
                build.onResolve({ filter: /^jquery$/ }, args => {
                    // args.importer is the file doing the require/import
                    if (args.importer && /jquery\.terminal/.test(args.importer)) {
                        return { external: true, path: "" };
                    }
                    // otherwise let build resolve normally
                    return;
                });
            }
        },
        {
            name: "HTML_PROCESS",
            setup(build) {
                build.onLoad({ filter: /\.html$/ }, async args => {
                    const html = await Bun.file(args.path).text();
                    const dom = parse(html);
                    // 1. parse markdown
                    markdown(dom as any);

                    // 2. If we're on the docs page, insert the documentation stuffs
                    const docEl = dom.querySelector("#__DOCS_CONTENT__");
                    if (docEl) {
                        docEl.removeAttribute("id");
                        const { html, sidebar } = docsToHTML(extractBackolonDocs(await Bun.file(await Bun.resolve("../typedoc_output.json", import.meta.dir)).json()));
                        docEl.innerHTML = html;

                        const sidebarEl = dom.querySelector("#__DOCS_SIDEBAR__")!;
                        sidebarEl.removeAttribute("id");
                        sidebarEl.innerHTML = sidebar;
                    }
                    return {
                        contents: dom.outerHTML,
                        loader: "html",
                    };
                });
            },
        }
    ],
});

console.log("Web Build OK");
