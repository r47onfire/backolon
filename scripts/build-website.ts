import markdown from "markdown-it";
import attrs from "markdown-it-attrs";
import { parse } from "node-html-parser";
import Prism from "prismjs";
import plugin from "../src/plugin";
import { build } from "./build-common.js";
import { docsToHTML } from "./build-docs";
import { compileAllBackolonDocs } from "./doc-extract";

const md = new markdown({
    html: true,
    linkify: true,
    typographer: true,
    highlight: syntaxHighlight,
});
md.use(attrs);

function syntaxHighlight(string: string, lang: string): string {
    if (lang === "backolon") {
        // TODO: Backolon self-highlighting using an Unparser
        return string;
    }
    return Prism.highlight(string, Prism.languages[lang]!, lang);
}

function renderMarkdown(string: string, mode: "block" | "inline") {
    return md[mode === "block" ? "render" : "renderInline"](string);
}

function dedent(str: string) {
    str = str.replace(/^(\s*)\n/, "");
    const match = str.match(/^[^\S\r\n]+/);
    const unIndented = match
        ? str.replace(new RegExp("^" + match[0], "gm"), "")
        : str;
    return unIndented;
}

function markdownElement(html: HTMLElement) {
    const elsWithMarkdown = html.querySelectorAll("[markdown]");
    for (var el of elsWithMarkdown) {
        const html2 = dedent(el.innerHTML);
        if (parse(html2).querySelector("[markdown]"))
            throw new Error("nested [markdown] attributes are buggy af");
        el.innerHTML = renderMarkdown(
            html2,
            el.getAttribute("markdown") as any,
        );
        el.removeAttribute("markdown");
    }
}

await build({
    splitting: true,
    // minify: true,
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
            name: "HTML_PROCESS",
            setup(build) {
                build.onLoad({ filter: /\.html$/ }, async (args) => {
                    const html = await Bun.file(args.path).text();
                    const dom = parse(html);
                    // 1. parse markdown
                    markdownElement(dom as any);

                    // 2. If we're on the docs page, insert the documentation stuffs
                    const docEl = dom.querySelector("#__DOCS_CONTENT__");
                    if (docEl) {
                        docEl.removeAttribute("id");
                        const { html, sidebar } = docsToHTML(
                            compileAllBackolonDocs(),
                        );
                        docEl.innerHTML = html;

                        const sidebarEl =
                            dom.querySelector("#__DOCS_SIDEBAR__")!;
                        sidebarEl.removeAttribute("id");
                        sidebarEl.innerHTML = sidebar;
                    }
                    return {
                        contents: dom.outerHTML,
                        loader: "html",
                    };
                });
            },
        },
    ],
});

console.log("Web Build OK");
