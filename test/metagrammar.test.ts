import { describe, expect, test } from "bun:test";
import { alt, ambient, bind, buildGrammar, compileCombinator, compileRule, cut, describeCombinator, die, nothing, GrammarCombinator, grammarFromText, if_, ignored, joined, kw, lit, lookahead, metaGrammar, no, nonempty, opt, param, parseCombinator, parseRule, parseToCST, rule, sameline, seq, ssep, tag, try_, CSTNode } from "../src";

type ASTNode = string | number | undefined | ASTNode[];
const toAST = (cst: CSTNode): ASTNode => {
    const c = () => cst.children?.filter(c => !c.ignored).flatMap(c => c.type ? [toAST(c)] : toAST(c)) ?? [];
    if (cst.errorExpected) return [cst.type, describeCombinator(cst.errorExpected), cst.end, cst.text];
    if (cst.type) return [cst.type, ...c()];
    if (cst.children) return c();
    return cst.text;
};

/** Parse a text with the metagrammar, require a full error-free parse, and return the AST. */
const ast = (text: string, entry = "combinator"): ASTNode => {
    const cst = parseToCST(text, 0, entry, metaGrammar, entry);
    expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
    expect(cst.end).toBe(text.length);
    return JSON.parse(JSON.stringify(toAST(cst)));
};

/** Parse a text with the metagrammar and require only that it parses in full. */
const parsesFully = (text: string, entry = "combinator") => { ast(text, entry); };

/** A text must not parse in full: sequences and alternatives do not mix. */
const doesNotParse = (text: string) => {
    const cst = parseToCST(text, 0, "combinator", metaGrammar, "combinator");
    expect(cst.errorExpected !== undefined || cst.end !== text.length).toBe(true);
};

const ruleRef = (name: string): ASTNode => ["rule_ref", "<", ["name", name], null, ">"];

describe("metagrammar: forms", () => {
    test("keyword", () => {
        expect(ast("%keyword=else/end")).toEqual(["combinator", ["alternatives", ["postfixed", ["keyword_form", "%", ["name", "keyword"], "=", ["kw_options", ["kw_option", "else"], "/", ["kw_option", "end"]]]]]]);
    });
    test("sequence body", () => {
        expect(ast("<a> <b>*")).toEqual(["combinator", ["sequence", ruleRef("a"), ["postfixed", ruleRef("b"), ["repeat_post", "*"]]]]);
    });
    test("alternatives body", () => {
        expect(ast("<a> | <b>")).toEqual(["combinator", ["alternatives", ruleRef("a"), "|", ["postfixed", ruleRef("b")]]]);
    });
    test("a parenthesized alternatives inside a sequence", () => {
        expect(ast("(<a> | <b>) <c>")).toEqual(["combinator", ["sequence", ["paren", "(", ["alternatives", ruleRef("a"), "|", ruleRef("b")], ")"], ["postfixed", ruleRef("c")]]]);
    });
    test("ignored", () => {
        expect(ast(";<blank>?")).toEqual(["combinator", ["alternatives", ["postfixed", ["ignored_form", ";", ["postfixed", ruleRef("blank"), ["opt_post", "?"]]]]]]);
    });
    test("bind", () => {
        expect(ast("&+guard=(?!%keyword=end)-(<a> <b>)")).toEqual(["combinator", ["alternatives", ["postfixed", ["bind_form", "&+", ["name", "guard"], "=", ["lookahead_neg", "(?!", ["keyword_form", "%", ["name", "keyword"], "=", ["kw_options", ["kw_option", "end"]]], ")"], "-", ["postfixed", ["paren", "(", ["sequence", ruleRef("a"), ruleRef("b")], ")"]]]]]]);
    });
    test("if", () => {
        expect(ast("(?(<c>) \"a\" // \"b\")")).toEqual(["combinator", ["alternatives", ["postfixed", ["if_form", "(?(", ruleRef("c"), ")", ["string_literal", "\"a\""], "//", ["string_literal", "\"b\""], ")"]]]]);
    });
    test("ssep", () => {
        expect(ast("<ws>.@(<x> <y>)")).toEqual(["combinator", ["alternatives", ["postfixed", ruleRef("ws"), ["ssep_post", ".@(", ["items", ruleRef("x"), ruleRef("y")], ")"]]]]);
    });
    test("joined over bare names", () => {
        expect(ast("a.b+")).toEqual(["combinator", ["alternatives", ["postfixed", ["rule_ref", ["name", "a"], null], ["joined_post", ".", ["joined_element", ["rule_ref", ["name", "b"], null]], "+"]]]]);
    });
    test("cut with a depth", () => {
        expect(ast("!2")).toEqual(["combinator", ["alternatives", ["postfixed", ["cut_form", "!", ["number", "2"]]]]]);
    });
    test("param with a default", () => {
        expect(ast("$x:<y>")).toEqual(["combinator", ["alternatives", ["postfixed", ["param_ref", "$", ["name", "x"], ":", ["postfixed", ruleRef("y")]]]]]);
    });
    test("() is the nothing form", () => {
        expect(ast("()")).toEqual(["combinator", ["alternatives", ["postfixed", ["nothing_form", "(", ")"]]]]);
    });
    test("(|) is an empty alternatives", () => {
        expect(ast("(|)")).toEqual(["combinator", ["alternatives", ["postfixed", ["empty_alt_form", "(", "|", ")"]]]]);
    });
    test("a rule reference with arguments", () => {
        expect(ast("<body_exprs(%keyword=end, ())>")).toEqual(["combinator", ["alternatives", ["postfixed", ["rule_ref", "<", ["name", "body_exprs"], ["arg_list", "(", ["alternatives", ["keyword_form", "%", ["name", "keyword"], "=", ["kw_options", ["kw_option", "end"]]]], ",", ["alternatives", ["nothing_form", "(", ")"]], ")"], ">"]]]]);
    });
    test("sequences and alternatives do not mix", () => {
        doesNotParse("<a> | <b> <c>");
        doesNotParse("<a> <b> | <c>");
        doesNotParse("(<a> | <b> <c>)");
    });
});

describe("metagrammar: rule definitions", () => {
    test("a plain definition", () => {
        expect(ast("foo: bar baz", "rule_definition")).toEqual(["rule_definition", ["name", "foo"], null, ":", ["sequence", ["rule_ref", ["name", "bar"], null], ["postfixed", ["rule_ref", ["name", "baz"], null]]]]);
    });
    test("a parameterized definition", () => {
        expect(ast("baz(x): abc $x", "rule_definition")).toEqual(["rule_definition", ["name", "baz"], ["param_list", "(", ["name", "x"], ")"], ":", ["sequence", ["rule_ref", ["name", "abc"], null], ["postfixed", ["param_ref", "$", ["name", "x"], null]]]]);
    });
    test("grammar texts parse at the grammar entry", () => {
        parsesFully("foo: bar baz\nbaz(x): abc $x", "grammar");
        parsesFully("one: <two> | <three>\ntwo: \"x\"", "grammar");
    });
});

describe("metagrammar: whitespace", () => {
    test("whitespace is insignificant", () => {
        parsesFully("(  <a>   |   <b>  )");
        parsesFully("(\n\t<a>\n\t|\n\t<b>\n)");
        parsesFully("&+guard =\n\t(?!%keyword=end)\n\t-\n\t(<x> <y>)");
        parsesFully("%keyword =\n catch/finally");
        parsesFully("<blank> .@(\n\t<x>\n\t<y>\n)");
        parsesFully("<a> . <b> +");
        parsesFully("<x> *");
        parsesFully("<x> ?");
        parsesFully("( | )");
    });
});

describe("compile: forms lower to combinators", () => {
    const compilesTo = (text: string, combinator: GrammarCombinator) =>
        expect(compileCombinator(parseCombinator(text))).toEqual(combinator);
    test("keyword", () => compilesTo("%keyword=else/end", kw("keyword", "else", "end")));
    test("rule with arguments", () => compilesTo("<body_exprs(%keyword=end, ())>", rule("body_exprs", kw("keyword", "end"), nothing())));
    test("bind", () => compilesTo("&+guard=(?!%keyword=end)-(<a> <b>)", bind("guard", true, lookahead(false, kw("keyword", "end")), seq(rule("a"), rule("b")))));
    test("if", () => compilesTo("(?(<c>) \"a\" // \"b\")", if_(rule("c"), lit("a"), lit("b"))));
    test("ssep and joined", () => {
        compilesTo("<ws>.@(<x> <y>)", ssep(rule("ws"), rule("x"), rule("y")));
        compilesTo("a.b+", joined(rule("a"), rule("b"), false, true));
    });
    test("references with defaults", () => {
        compilesTo("$x:<y>", param("x", rule("y")));
        compilesTo("@g:()", ambient("g", nothing()));
    });
    test("the prefix forms", () => {
        compilesTo("(?!<x>)", lookahead(false, rule("x")));
        compilesTo("(=<x>)", sameline(rule("x")));
        compilesTo("(+<x>)", nonempty(rule("x")));
        compilesTo("[<x>]", try_(rule("x")));
    });
    test("miscellaneous forms", () => {
        compilesTo(";<blank>?", ignored(opt(rule("blank"))));
        compilesTo("#op=\"+\"", tag("op", lit("+")));
        compilesTo("^\"msg\"", die("msg"));
        compilesTo("!2", cut(2));
        compilesTo("!", cut(1));
        compilesTo("()", nothing());
        compilesTo("(|)", no());
    });
    test("bodies and groups", () => {
        compilesTo("<a> <b>", seq(rule("a"), rule("b")));
        compilesTo("<a> | <b>", alt(rule("a"), rule("b")));
        compilesTo("(<a> <b>)", seq(rule("a"), rule("b")));
        compilesTo("(<a> | <b>) <c>", seq(alt(rule("a"), rule("b")), rule("c")));
    });
});

describe("compile: grammars written as strings", () => {
    test("compileRule on single definitions", () => {
        expect(compileRule(parseRule("foo: bar baz"))).toEqual(["foo", seq(rule("bar"), rule("baz"))]);
        expect(compileRule(parseRule("baz(x): abc $x"))).toEqual(["baz", [["x"], seq(rule("abc"), param("x"))]]);
    });
    test("a built grammar parses", () => {
        const grammar = buildGrammar("pair: <word> <blank> <word>", "blank: /\\s+/", "word: /[a-z]+/");
        const cst = parseToCST("hello world", 0, "pair", grammar, "pair");
        expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
        expect(cst.end).toBe(11);
    });
    test("a parameterized rule built from strings parses", () => {
        const grammar = buildGrammar("twice(x): $x $x", "aa: <twice(/a/)>");
        const cst = parseToCST("aa", 0, "aa", grammar, "aa");
        expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
        expect(cst.end).toBe(2);
    });
    test("a grammar from one long text parses", () => {
        const grammar = grammarFromText("greet: %keyword=hello <blank> <name>\nblank: /\\s+/\nname: /[a-z]+/");
        const cst = parseToCST("hello bob", 0, "greet", grammar, "greet");
        expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
        expect(cst.end).toBe(9);
    });
});
