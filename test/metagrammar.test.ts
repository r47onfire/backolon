import { describe, expect, test } from "bun:test";
import { alt, altFirst, ambient, backolonGrammar, bind, buildGrammar, compileCombinator, compileRule, cut, describeCombinator, die, nothing, GrammarCombinator, grammarFromText, if_, ignored, joined, kw, lit, lookahead, metaGrammar, nonempty, no, opt, param, parseCombinator, parseRule, parseToCST, regex, rep, rule, sameline, seq, ssep, tag, try_, CSTNode } from "../src";

type ASTNode = string | number | undefined | ASTNode[];
const toAST = (cst: CSTNode): ASTNode => {
    const c = () => cst.children?.filter(c => !c.ignored).flatMap(c => c.type ? [toAST(c)] : toAST(c)) ?? [];
    if (cst.errorExpected) return [cst.type, describeCombinator(cst.errorExpected), cst.end, cst.text];
    if (cst.type) return [cst.type, ...c()];
    if (cst.children) return c();
    return cst.text;
};

/** Parse a text with the metagrammar and require a full, error-free parse. */
const parsesFully = (text: string, entry = "combinator") => {
    const cst = parseToCST(text, 0, entry, metaGrammar, entry);
    expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
    expect(cst.end).toBe(text.length);
};

/**
 * A combinator's description must parse with the metagrammar and
 * compile back to a combinator whose description is the same text:
 * describe is a fixed point of parse + compile, even for the forms
 * describe renders lossily (an altFirst compiles to an alt, a
 * joined's flags take the defaults -- neither changes the text).
 */
const roundTrips = (combinator: GrammarCombinator) => {
    const text = describeCombinator(combinator);
    expect(describeCombinator(compileCombinator(parseCombinator(text)))).toBe(text);
};

describe("metagrammar: one form per operation", () => {
    test("literal", () => {
        roundTrips(lit("hello"));
        roundTrips(lit('with "quotes" and \\escapes'));
    });
    test("regex", () => {
        roundTrips(regex(/[a-z]+/));
        roundTrips(regex(/a\/b[c/d]e/gi));
    });
    test("keyword", () => roundTrips(kw("keyword", "else", "end")));
    test("rule", () => {
        roundTrips(rule("expr"));
        roundTrips(rule("body_exprs", kw("keyword", "end"), nothing()));
    });
    test("param", () => {
        roundTrips(param("end"));
        roundTrips(param("end", nothing()));
        roundTrips(param("guard", lookahead(false, kw("keyword", "end"))));
    });
    test("ambient", () => {
        roundTrips(ambient("guard"));
        roundTrips(ambient("guard", nothing()));
    });
    test("bind", () => {
        roundTrips(bind("guard", false, nothing(), rule("expr")));
        roundTrips(bind("guard", true, lookahead(false, kw("keyword", "end")), seq(rule("a"), rule("b"))));
    });
    test("sequence", () => {
        roundTrips(seq(lit("a"), rule("b"), lit("c")));
        roundTrips(seq());
    });
    test("ssep", () => {
        roundTrips(ssep(rule("blank"), rule("item")));
        roundTrips(ssep(ignored(rule("ws_comma")), rule("a"), rule("b")));
        roundTrips(ssep(rule("blank")));
    });
    test("alternatives", () => {
        roundTrips(alt(lit("a"), lit("b")));
        roundTrips(altFirst(lit("a"), seq(lit("b"), lit("c"))));
        roundTrips(no());
    });
    test("optional", () => {
        roundTrips(opt(lit("a")));
        roundTrips(opt(seq(lit("a"), lit("b"))));
    });
    test("repeat", () => {
        roundTrips(rep(true, lit("a")));
        roundTrips(rep(false, seq(rule("a"), lit(","))));
    });
    test("joined", () => roundTrips(joined(ignored(rule("ws_comma")), rule("item"), false, true)));
    test("if", () => roundTrips(if_(rule("c"), lit("a"), lit("b"))));
    test("tag", () => roundTrips(tag("operator", lit("+"))));
    test("ignored", () => roundTrips(ignored(opt(rule("blank")))));
    test("cut", () => {
        roundTrips(cut());
        roundTrips(cut(3));
    });
    test("lookahead", () => {
        roundTrips(lookahead(true, rule("a")));
        roundTrips(lookahead(false, kw("keyword", "end")));
    });
    test("nonempty", () => roundTrips(nonempty(rule("implicit_args"))));
    test("sameline", () => roundTrips(sameline(rule("blank"))));
    test("nothing", () => roundTrips(nothing()));
    test("try", () => {
        roundTrips(try_(rule("implicit_args")));
        roundTrips(try_(seq(lit("a"), lit("b"))));
    });
    test("die", () => roundTrips(die("expected a thing")));
    test("nested", () => roundTrips(seq(
        ignored(ambient("guard", nothing())),
        altFirst(rule("block_expr"), seq(rule("a"), cut(2), rep(false, ignored(rule("blank"))))),
    )));
});

describe("metagrammar: whitespace and the empty forms", () => {
    test("whitespace is insignificant", () => {
        parsesFully("(  <a>   |   <b>  )");
        parsesFully("(\n\t<a>\n\t|\n\t<b>\n)");
        parsesFully("&+guard =\n\t(?!%keyword=end)\n\t-\n\t(<x> <y>)");
        parsesFully("%keyword =\n catch/finally");
        parsesFully("<blank> .@(\n\t<x>\n\t<y>\n)");
        parsesFully("<a> . <b> +");
        parsesFully("<x> *");
        parsesFully("<x> ?");
    });
    test("() is the nothing form", () => {
        const cst = parseToCST("()", 0, "combinator", metaGrammar, "combinator");
        expect(cst.end).toBe(2);
        expect(JSON.stringify(toAST(cst))).toContain('"nothing_form"');
        expect(compileCombinator(parseCombinator("()"))).toEqual(nothing());
    });
    test("(|) is an empty alternatives", () => {
        const cst = parseToCST("(|)", 0, "combinator", metaGrammar, "combinator");
        expect(cst.end).toBe(3);
        expect(JSON.stringify(toAST(cst))).toContain('"empty_alt_form"');
        expect(compileCombinator(parseCombinator("(|)"))).toEqual(no());
        parsesFully("( | )");
    });
});

describe("metagrammar: the whole Backolon grammar round-trips", () => {
    for (const [name, entry] of Object.entries(backolonGrammar)) {
        test(name, () => roundTrips(Array.isArray(entry) ? entry[1] : entry));
    }
});

describe("metagrammar: grammars written as strings", () => {
    test("compileRule on single definitions", () => {
        const [fooName, foo] = compileRule(parseRule("foo: bar baz"));
        expect(fooName).toBe("foo");
        expect(describeCombinator(foo as GrammarCombinator)).toBe("(<bar> <baz>)");
        const [bazName, baz] = compileRule(parseRule("baz(x): abc $x"));
        expect(bazName).toBe("baz");
        const [params, body] = baz as [string[], GrammarCombinator];
        expect(params).toEqual(["x"]);
        expect(describeCombinator(body)).toBe("(<abc> $x)");
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
    test("grammar texts parse at the grammar entry", () => {
        parsesFully("foo: bar baz\nbaz(x): abc $x", "grammar");
        parsesFully("one: <two> | <three>\ntwo: \"x\"", "grammar");
    });
});
