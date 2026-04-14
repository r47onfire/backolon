import Prism from "prismjs";
import { Documentation, Example, FunctionDoc, SyntaxDoc, ValueDoc } from "./doc";

const e = Bun.escapeHTML;

function syntaxHighlight(string: string, lang: string): string {
    if (lang === "backolon") {
        // TODO: Backolon self-highlighting using an Unparser
        return string;
    }
    return Prism.highlight(string, Prism.languages[lang]!, lang);
}

function renderExamples(examples: Example[]) {
    return examples.map(ex => `<pre class="api-example">${syntaxHighlight(ex.code, ex.lang)}</pre>`).join("");
}

function s(text: string) {
    return text.replaceAll(/[^a-z0-9 -]/ig, "").replaceAll(/\s+/g, "-").replaceAll(/-+/g, "-").toLowerCase();
}

function renderNameThing<T extends keyof HTMLElementTagNameMap>(elType: T, name: string, type: string | undefined, lazy: boolean, rest: boolean, description: string | undefined, colon: boolean) {
    var str = `<${elType}>${e(name)}`;
    if (type || lazy || rest) str += " (";
    if (lazy) {
        str += "lazy";
        if (rest) str += ","
        if (type || rest) str += " ";
    }
    if (rest) {
        str += "rest"
        if (lazy) str += ",";
        if (type) str += " ";
    }
    if (type) str += type;
    if (type || lazy || rest) str += ")";
    if (description) {
        if (colon) str += ": ";
        str += description;
    }
    str += `</${elType}>`;
    return str;
}

function renderFunction(modName: string, func: FunctionDoc) {
    return {
        html: [
            '<div class="api-item">',
            // signature
            `<strong class="api-signature" id="${s(modName)}-function-${s(func.name)}"><code>${e(func.name)}</code></strong>`,
            // info
            '<div class="api-info">Parameters:<ul>',
            func.params.map(({ name, type, lazy, rest, description }) => renderNameThing("li", name, type, lazy, rest, description, true)).join(""),
            "</ul>",
            func.returns || func.returnType ? renderNameThing("span", "Returns: ", func.returnType, false, false, func.returns, false) : "",
            `<p>${func.description}</p></div>`,
            // examples
            renderExamples(func.examples),
            "</div>",
        ].join(""),
        nav: `<a class="nav-entry function" href="#${s(modName)}-function-${s(func.name)}">${e(func.name)}</a>`,
    };
}

function renderValue(modName: string, val: ValueDoc) {
    return {
        html: [
            '<div class="api-item">',
            // signature
            `<strong class="api-signature" id="${s(modName)}-value-${s(val.name)}"><code>${e(val.name)}</code></strong>`,
            // type
            val.type ? `<div class="api-info">Type: ${e(val.type)}</div>` : "",
            // description
            `<p>${val.description}</p>`,
            // examples
            renderExamples(val.examples),
            "</div>",
        ].join(""),
        nav: `<a class="nav-entry value" href="#${s(modName)}-value-${s(val.name)}">${e(val.name)}</a>`,
    };
}

function renderSyntax(modName: string, syn: SyntaxDoc) {
    return {
        html: [
            '<div class="api-item">',
            // name
            `<strong class="api-signature" id="${s(modName)}-syntax-${s(syn.name)}">${e(syn.name)}</strong>`,
            // patterns
            '<div class="api-info">Syntax:<ul>',
            ...syn.shapes.map(sh => `<li><pre class="language-backolon">${syntaxHighlight(sh, "backolon")}</pre></li>`),
            "</ul></div>",
            // description
            `<p>${syn.description}</p>`,
            // examples
            renderExamples(syn.examples),
            "</div>",
        ].join(""),
        nav: `<a class="nav-entry syntax" href="#${s(modName)}-syntax-${s(syn.name)}">${e(syn.name)}</a>`,
    };
}

export function docsToHTML(docs: Documentation) {
    var html = "", sidebar = "";
    for (var [modName, modDoc] of Object.entries(docs)) {
        sidebar += `<details open><summary><a href="#module-${s(modName)}">${e(modName)}</a></summary>`;
        var section = "";
        if (modDoc.functions.length > 0) {
            section += `<section class="api-section"><h3>Functions</h3>`;
            for (var doc of modDoc.functions) {
                const { html, nav } = renderFunction(modName, doc);
                section += html;
                sidebar += nav;
            }
            section += "</section>";
        }
        if (modDoc.values.length > 0) {
            section += `<section class="api-section"><h3>Values</h3>`;
            for (var val of modDoc.values) {
                const { html, nav } = renderValue(modName, val);
                section += html;
                sidebar += nav;
            }
            section += "</section>";
        }
        if (modDoc.syntax.length > 0) {
            section += `<section class="api-section"><h3>Syntax</h3>`;
            for (var syn of modDoc.syntax) {
                const { html, nav } = renderSyntax(modName, syn);
                section += html;
                sidebar += nav;
            }
            section += "</section>";
        }
        sidebar += "</details>";
        html += `<h2 id="module-${s(modName)}">${e(modName)}</h2>`;
        html += `<section>${section}</section>`;
    }
    return { html, sidebar };
}
