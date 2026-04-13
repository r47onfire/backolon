import Prism from "prismjs";
import { get, html, make } from "vanilla";
import { Documentation, Example, FunctionDoc, SyntaxDoc, ValueDoc } from "../scripts/doc";
// @ts-ignore
import LANGUAGE_DOCS from "$_DOCUMENTATION";
declare const LANGUAGE_DOCS: Documentation;

function syntaxHighlight(string: string, lang: string): string {
    if (lang === "backolon") {
        // TODO: Backolon self-highlighting using an Unparser
        return string;
    }
    return Prism.highlight(string, Prism.languages[lang]!, lang);
}

function renderExamples(examples: Example[]) {
    return examples.map(ex => {
        const el = make("pre.api-example", {});
        el.innerHTML = syntaxHighlight(ex.code, ex.lang);
        return el;
    });
}

function renderNameThing<T extends keyof HTMLElementTagNameMap>(elType: T, name: string, type: string | undefined, lazy: boolean, rest: boolean, description: string | undefined, colon: boolean) {
    const el = make(elType);
    el.append(name);
    if (type || lazy || rest) el.append(" (");
    if (lazy) {
        el.append("lazy");
        if (rest) el.append(",")
        if (type || rest) el.append(" ");
    }
    if (rest) {
        el.append("rest");
        if (lazy) el.append(",");
        if (type) el.append(" ");
    }
    if (type) el.append(type);
    if (type || lazy || rest) el.append(")");
    if (description) {
        if (colon) el.append(": ");
        el.append(html(description));
    }
    return el;
}

function renderFunction(func: FunctionDoc) {
    return make("div.api-item", {},
        make("strong.api-signature", {}, make("code", {}, func.name)),
        make("div.api-info", {},
            make("div", {}, "Parameters:",
                make("ul", {},
                    ...func.params.map(({ name, type, lazy, rest, description }) => renderNameThing("li", name, type, lazy, rest, description, true))
                )
            ),
            ...(func.returns || func.returnType ? [renderNameThing("span", "Returns: ", func.returnType, false, false, func.returns, false)] : []),
            make("p", {}, html(func.description))),
        ...renderExamples(func.examples)
    );
}

function renderValue(val: ValueDoc) {
    return make("div.api-item", {},
        make("strong.api-signature", {}, make("code", {}, val.name)),
        ...(val.type ? [make("div.api-info", {}, "Type: ", val.type)] : []),
        make("p", {}, html(val.description)),
        ...renderExamples(val.examples),
    );
}

function renderSyntax(syn: SyntaxDoc) {
    return make("div.api-item", {},
        make("strong.api-signature", {}, make("code", {}, syn.shape)),
        make("p", {}, html(syn.description)),
        ...renderExamples(syn.examples),
    );
}

document.addEventListener("DOMContentLoaded", () => {
    const container = get("#language-content");
    if (!container) throw "unreachable";


    Object.entries(LANGUAGE_DOCS).forEach(([modName, modDoc]) => {
        const sections = [];
        if (modDoc.functions.length > 0) {
            sections.push(make("section.api-section", {},
                make("h2", {}, "Functions"),
                ...modDoc.functions.map(renderFunction)
            ));
        }
        if (modDoc.values.length > 0) {
            sections.push(make("section.api-section", {},
                make("h2", {}, "Values"),
                ...modDoc.values.map(renderValue)
            ));
        }
        if (modDoc.syntax.length > 0) {
            sections.push(make("section.api-section", {},
                make("h2", {}, "Syntax"),
                ...modDoc.syntax.map(renderSyntax)
            ));
        }
        container.append(
            make("h2", {}, modName),
            make("section", {}, ...sections)
        );
    });

});
