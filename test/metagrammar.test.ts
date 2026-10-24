import { describe, expect, test } from "bun:test";
import { describeCombinator, metaGrammar, parseToCST, CSTNode } from "../src";

// TODO: this is duplicated on the two tests files...
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

const TESTS: Record<string, [string, [string, ASTNode][]]> = {

    "basic forms": ["combinator", [
        ["abc", ["rule_ref", ["name", "abc"]]],
        ["%keyword=else/end", ["keyword", ["name", "keyword"], ["kw_options", ["kw_option", "else"], ["kw_option", "end"]]]],
        ["<a> <b>*", ["sequence", ["rule_ref", ["name", "a"], undefined], ["postfixed", ["rule_ref", ["name", "b"], undefined], ["repeat_opt", "*"]]]],
        ["<a> | <b>", ["alternatives", ["rule_ref", ["name", "a"], undefined], ["rule_ref", ["name", "b"], undefined]]],
        ["<a> || <b>", ["first_alternatives", ["rule_ref", ["name", "a"], undefined], ["rule_ref", ["name", "b"], undefined]]],
        ["(<a> | <b>) <c>", ["sequence", ["paren", ["alternatives", ["rule_ref", ["name", "a"], undefined], ["rule_ref", ["name", "b"], undefined]]], ["rule_ref", ["name", "c"], undefined]]],
        ["(<a> || <b>) <c>", ["sequence", ["paren", ["first_alternatives", ["rule_ref", ["name", "a"], undefined], ["rule_ref", ["name", "b"], undefined]]], ["rule_ref", ["name", "c"], undefined]]],
        [";<blank>?", ["ignored", ["postfixed", ["rule_ref", ["name", "blank"], undefined], ["opt", "?"]]]],
        ["&+guard=(?!%keyword=end)-(<a> <b>)", ["bind", "&+", ["name", "guard"], ["lookahead_neg", ["keyword", ["name", "keyword"], ["kw_options", ["kw_option", "end"]]]], ["paren", ["sequence", ["rule_ref", ["name", "a"], undefined], ["rule_ref", ["name", "b"], undefined]]]]],
        ["(?(<c>) \"a\" // \"b\")", ["if", ["rule_ref", ["name", "c"], undefined], ["string_literal", "\"a\""], ["string_literal", "\"b\""]]],
        ["<ws>.@(<x> <y>)", ["postfixed", ["rule_ref", ["name", "ws"], undefined], ["ssep", ["items", ["rule_ref", ["name", "x"], undefined], ["rule_ref", ["name", "y"], undefined]]]]],
        ["a.b+", ["postfixed", ["rule_ref", ["name", "a"], undefined], ["joined", ["joined_element", ["rule_ref", ["name", "b"], undefined]], undefined]]],
        ["a.b+2", ["postfixed", ["rule_ref", ["name", "a"], undefined], ["joined", ["joined_element", ["rule_ref", ["name", "b"], undefined]], ["joined_flags", "2"]]]],
        ["a.b+t", ["postfixed", ["rule_ref", ["name", "a"], undefined], ["joined", ["joined_element", ["rule_ref", ["name", "b"], undefined]], ["joined_flags", "t"]]]],
        ["a.b+2t", ["postfixed", ["rule_ref", ["name", "a"], undefined], ["joined", ["joined_element", ["rule_ref", ["name", "b"], undefined]], ["joined_flags", "2t"]]]],
        ["!2", ["cut", ["number", "2"]]],
        ["$x:<y>", ["param_ref", ["name", "x"], ["rule_ref", ["name", "y"], undefined]]],
        ["()", ["nothing"]],
        ["(|)", ["empty_alt"]],
        ["<body_exprs(%keyword=end, ())>", ["rule_ref", ["name", "body_exprs"], ["arg_list", ["keyword", ["name", "keyword"], ["kw_options", ["kw_option", "end"]]], ["nothing"]]]],
    ]],

    "rule definitions": ["rule_definition", [
        ["foo: bar baz", ["rule_definition", ["name", "foo"], undefined, ["sequence", ["rule_ref", ["name", "bar"], undefined], ["rule_ref", ["name", "baz"], undefined]]]],
        ["baz(x): abc $x", ["rule_definition", ["name", "baz"], ["param_list", ["name", "x"]], ["sequence", ["rule_ref", ["name", "abc"], undefined], ["param_ref", ["name", "x"], undefined]]]],
    ]],
    "grammar definitions": ["grammar", [
        ["foo: bar baz\nbaz(x): abc $x", ["grammar", ["rule_definition", ["name", "foo"], undefined, ["sequence", ["rule_ref", ["name", "bar"], undefined], ["rule_ref", ["name", "baz"], undefined]]], ["rule_definition", ["name", "baz"], ["param_list", ["name", "x"]], ["sequence", ["rule_ref", ["name", "abc"], undefined], ["param_ref", ["name", "x"], undefined]]]]]],
        ["one: <two> | <three>\ntwo: \"x\"", ["grammar", ["rule_definition", ["name", "one"], undefined, ["alternatives", ["rule_ref", ["name", "two"], undefined], ["rule_ref", ["name", "three"], undefined]]], ["rule_definition", ["name", "two"], undefined, ["string_literal", "\"x\""]]]],
        ["expr: <block_expr> || <simple_expr>", ["grammar", ["rule_definition", ["name", "expr"], undefined, ["first_alternatives", ["rule_ref", ["name", "block_expr"], undefined], ["rule_ref", ["name", "simple_expr"], undefined]]]],
    ]],
};

describe.each(Object.entries(TESTS))("%s", (_, [ruleName, list]) => {
    test.each(list.map(([s, n]) => [JSON.stringify(s), s, n]))("%s", (_, str, node) => {
        expect(toAST(parsesFully(str, ruleName))).toEqual(node);
    });
});

describe("whitespace is insignificant", () => {
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

describe("mixed alt/seq forms do not parse", () => {
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
