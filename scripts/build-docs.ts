import Prism from "prismjs";
import { Documentation, Example, FunctionDoc, SyntaxDoc, ValueDoc } from "./doc";

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

function renderNameThing<T extends keyof HTMLElementTagNameMap>(elType: T, name: string, type: string | undefined, lazy: boolean, rest: boolean, description: string | undefined, colon: boolean) {
    var str = `<${elType}>${Bun.escapeHTML(name)}`;
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

function renderFunction(func: FunctionDoc) {
    return [
        '<div class="api-item">',
        // signature
        `<strong class="api-signature"><code>${Bun.escapeHTML(func.name)}</code></strong>`,
        // info
        '<div class="api-info">Parameters: <ul>',
        func.params.map(({ name, type, lazy, rest, description }) => renderNameThing("li", name, type, lazy, rest, description, true)).join(""),
        "</ul>",
        func.returns || func.returnType ? renderNameThing("span", "Returns: ", func.returnType, false, false, func.returns, false) : "",
        `<p>${func.description}</p></div>`,
        // examples
        renderExamples(func.examples),
        "</div>",
    ].join("");
}

function renderValue(val: ValueDoc) {
    return [
        '<div class="api-item">',
        // signature
        `<strong class="api-signature"><code>${Bun.escapeHTML(val.name)}</code></strong>`,
        // type
        val.type ? `<div class="api-info">Type: ${Bun.escapeHTML(val.type)}</div>` : "",
        // description
        `<p>${val.description}</p>`,
        // examples
        renderExamples(val.examples),
        "</div>",
    ].join("");
}

function renderSyntax(syn: SyntaxDoc) {
    return [
        '<div class="api-item">',
        // signature
        `<strong class="api-signature"><code>${Bun.escapeHTML(syn.shape)}</code></strong>`,
        // description
        `<p>${syn.description}</p>`,
        // examples
        renderExamples(syn.examples),
        "</div>",
    ].join("");
}

export function docsToHTML(docs: Documentation) {
    var html = "", sidebar = "";
    Object.entries(docs).forEach(([modName, modDoc]) => {
        var section = "";
        if (modDoc.functions.length > 0) {
            section += '<section class="api-section"><h3>Functions</h3>';
            for (var doc of modDoc.functions) section += renderFunction(doc);
            section += "</section>";
        }
        if (modDoc.values.length > 0) {
            section += '<section class="api-section"><h3>Values</h3>';
            for (var val of modDoc.values) section += renderValue(val);
            section += "</section>";
        }
        if (modDoc.syntax.length > 0) {
            section += '<section class="api-section"><h3>Syntax</h3>';
            for (var syn of modDoc.syntax) section += renderSyntax(syn);
            section += "</section>";
        }
        html += `<h2>${Bun.escapeHTML(modName)}</h2>`;
        html += `<section>${section}</section>`;
    });
    return { html, sidebar };
}
