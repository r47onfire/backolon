import { get, html, make } from "vanilla";
import Prism from "prismjs";
import { Documentation, FunctionDoc, ValueDoc, SyntaxDoc, Example } from "../scripts/doc";
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

function renderNameThing<T extends keyof HTMLElementTagNameMap>(elType: T, name: string, type: string, lazy: boolean, description: string, colon: boolean) {
    const el = make(elType);
    el.append(name);
    if (type || lazy) el.append(" (");
    if (lazy) {
        el.append("lazy");
        if (type) el.append(" ");
    }
    if (type) el.append(type);
    if (type || lazy) el.append(")");
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
                    ...func.params.map(({ name, type, lazy, description }) => renderNameThing("li", name, type, lazy, description, true))
                )
            ),
            ...(func.returns || func.returnType ? [renderNameThing("span", "Returns: ", func.returnType, false, func.returns, false)] : []),
            make("p", {}, html(func.description))),
        ...renderExamples(func.examples)
    );
}

function renderValue(val: ValueDoc) {
    return make("div.api-item", {},
        make("strong.api-signature", {}, make("code", {}, val.name)),
        make("div.api-info", {}, "Type: ", val.type),
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

    const modules = Object.entries(LANGUAGE_DOCS);

    const tabNav = make("nav.tab-navigation", {},
        ...modules.map(([modName]) => make("button.tab-btn", { "data-tab": modName }, modName))
    );

    const tabContents = modules.map(([modName, modDoc]) => {
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
        return make("section.tab-content", { id: "tab-" + modName }, ...sections);
    });

    container.append(tabNav, ...tabContents);

    // Add event listeners
    const buttons = container.querySelectorAll(".tab-btn");
    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            // Remove active from all
            buttons.forEach(b => b.classList.remove("active"));
            container.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            // Add to this
            btn.classList.add("active");
            container.querySelector(`#tab-${btn.getAttribute("data-tab")}`)?.classList.add("active");
        });
    });

    // Set first active
    if (buttons.length > 0) {
        (buttons[0] as HTMLElement).click();
    }
});
