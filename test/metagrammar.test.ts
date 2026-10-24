import { describe, expect, test } from "bun:test";
import { describeCombinator, metaGrammar, parseToCST, CSTNode } from "../src";

type ASTNode = string | number | undefined | ASTNode[];
const toAST = (cst: CSTNode): ASTNode => {
    const c = () => cst.children?.filter(c => !c.ignored).flatMap(c => c.type ? [toAST(c)] : toAST(c)) ?? [];
    if (cst.errorExpected) return [cst.type, describeCombinator(cst.errorExpected), cst.end, cst.text];
    if (cst.type) return [cst.type, ...c()];
    if (cst.children) return c();
    return cst.text;
};

/** Parse a text with the metagrammar and require a full, error-free parse. */
const parsesFully = (text: string, entry = "combinator"): CSTNode => {
    const cst = parseToCST(text, 0, entry, metaGrammar, entry);
    expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
    expect(cst.end).toBe(text.length);
    return cst;
};

const ruleRef = (name: string): ASTNode => ["rule_ref", "<", ["name", name], undefined, ">"];
const bareRef = (name: string): ASTNode => ["rule_ref", ["name", name], undefined];

describe("metagrammar: forms", () => {
    const list: [string, ASTNode][] = [
        ["%keyword=else/end", ["combinator", ["alternatives", ["postfixed", ["keyword_form", "%", ["name", "keyword"], "=", ["kw_options", ["kw_option", "else"], "/", ["kw_option", "end"]]]]]]],
        ["<a> <b>*", ["combinator", ["sequence", ruleRef("a"), ["postfixed", ruleRef("b"), ["repeat_post", "*"]]]]],
        ["<a> | <b>", ["combinator", ["alternatives", ruleRef("a"), "|", ["postfixed", ruleRef("b")]]]],
        ["<a> || <b>", ["combinator", ["first_alternatives", ruleRef("a"), "||", ["postfixed", ruleRef("b")]]]],
        ["(<a> | <b>) <c>", ["combinator", ["sequence", ["paren", "(", ["alternatives", ruleRef("a"), "|", ruleRef("b")], ")"], ["postfixed", ruleRef("c")]]]],
        ["(<a> || <b>) <c>", ["combinator", ["sequence", ["paren", "(", ["first_alternatives", ruleRef("a"), "||", ruleRef("b")], ")"], ["postfixed", ruleRef("c")]]]],
        [";<blank>?", ["combinator", ["alternatives", ["postfixed", ["ignored_form", ";", ["postfixed", ruleRef("blank"), ["opt_post", "?"]]]]]]],
        ["&+guard=(?!%keyword=end)-(<a> <b>)", ["combinator", ["alternatives", ["postfixed", ["bind_form", "&+", ["name", "guard"], "=", ["lookahead_neg", "(?!", ["keyword_form", "%", ["name", "keyword"], "=", ["kw_options", ["kw_option", "end"]]], ")"], "-", ["postfixed", ["paren", "(", ["sequence", ruleRef("a"), ruleRef("b")], ")"]]]]]]],
        ["(?(<c>) \"a\" // \"b\")", ["combinator", ["alternatives", ["postfixed", ["if_form", "(?(", ruleRef("c"), ")", ["string_literal", "\"a\""], "//", ["string_literal", "\"b\""], ")"]]]]],
        ["<ws>.@(<x> <y>)", ["combinator", ["alternatives", ["postfixed", ruleRef("ws"), ["ssep_post", ".@(", ["items", ruleRef("x"), ruleRef("y")], ")"]]]]],
        ["a.b+", ["combinator", ["alternatives", ["postfixed", bareRef("a"), ["joined_post", ".", ["joined_element", bareRef("b")], "+", undefined]]]]],
        ["a.b+2", ["combinator", ["alternatives", ["postfixed", bareRef("a"), ["joined_post", ".", ["joined_element", bareRef("b")], "+", ["joined_flags", "2"]]]]]],
        ["a.b+t", ["combinator", ["alternatives", ["postfixed", bareRef("a"), ["joined_post", ".", ["joined_element", bareRef("b")], "+", ["joined_flags", "t"]]]]]],
        ["a.b+2t", ["combinator", ["alternatives", ["postfixed", bareRef("a"), ["joined_post", ".", ["joined_element", bareRef("b")], "+", ["joined_flags", "2t"]]]]]],
        ["!2", ["combinator", ["alternatives", ["postfixed", ["cut_form", "!", ["number", "2"]]]]]],
        ["$x:<y>", ["combinator", ["alternatives", ["postfixed", ["param_ref", "$", ["name", "x"], ":", ["postfixed", ruleRef("y")]]]]]],
        ["()", ["combinator", ["alternatives", ["postfixed", ["nothing_form", "(", ")"]]]]],
        ["(|)", ["combinator", ["alternatives", ["postfixed", ["empty_alt_form", "(", "|", ")"]]]]],
        ["<body_exprs(%keyword=end, ())>", ["combinator", ["alternatives", ["postfixed", ["rule_ref", "<", ["name", "body_exprs"], ["arg_list", "(", ["alternatives", ["keyword_form", "%", ["name", "keyword"], "=", ["kw_options", ["kw_option", "end"]]]], ",", ["alternatives", ["nothing_form", "(", ")"]], ")"], ">"]]]]],
    ];
    test.each(list.map(([s, n]) => [JSON.stringify(s), s, n]))("%s", (_, str, node) => {
        expect(toAST(parsesFully(str))).toEqual(node);
    });
});

describe("metagrammar: rule definitions", () => {
    const list: [string, ASTNode][] = [
        ["foo: bar baz", ["rule_definition", ["name", "foo"], undefined, ":", ["sequence", bareRef("bar"), ["postfixed", bareRef("baz")]]]],
        ["baz(x): abc $x", ["rule_definition", ["name", "baz"], ["param_list", "(", ["name", "x"], ")"], ":", ["sequence", bareRef("abc"), ["postfixed", ["param_ref", "$", ["name", "x"], undefined]]]]],
    ];
    test.each(list.map(([s, n]) => [JSON.stringify(s), s, n]))("%s", (_, str, node) => {
        expect(toAST(parsesFully(str, "rule_definition"))).toEqual(node);
    });
    const texts = [
        "foo: bar baz\nbaz(x): abc $x",
        "one: <two> | <three>\ntwo: \"x\"",
        "expr: <block_expr> || <simple_expr>",
    ];
    test.each(texts.map(s => [JSON.stringify(s), s]))("%s", (_, str) => {
        parsesFully(str, "grammar");
    });
});

describe("metagrammar: whitespace is insignificant", () => {
    const texts = [
        "(  <a>   |   <b>  )",
        "(\n\t<a>\n\t|\n\t<b>\n)",
        "&+guard =\n\t(?!%keyword=end)\n\t-\n\t(<x> <y>)",
        "%keyword =\n catch/finally",
        "<blank> .@(\n\t<x>\n\t<y>\n)",
        "<a> . <b> +",
        "<x> *",
        "<x> ?",
        "<a>  ||  <b>",
        "( | )",
    ];
    test.each(texts.map(s => [JSON.stringify(s), s]))("%s", (_, str) => {
        parsesFully(str);
    });
});

describe("metagrammar: mixed forms do not parse", () => {
    const texts = [
        "<a> | <b> <c>",
        "<a> <b> | <c>",
        "(<a> | <b> <c>)",
        "<a> | <b> || <c>",
        "<a> || <b> | <c>",
    ];
    test.each(texts.map(s => [JSON.stringify(s), s]))("%s", (_, str) => {
        const cst = parseToCST(str, 0, "combinator", metaGrammar, "combinator");
        expect(cst.errorExpected !== undefined || cst.end !== str.length).toBe(true);
    });
});
