import { describe, expect, test } from "bun:test";
import { alt, altFirst, ambient, backolonGrammar, bind, cut, describeCombinator, die, eps, GrammarCombinator, if_, ignored, joined, kw, lit, lookahead, metaGrammar, nonempty, no, opt, param, parseToCST, regex, rep, rule, sameline, seq, ssep, tag, try_ } from "../src";

/** Parse a combinator description with the metagrammar and require a full, error-free parse. */
const parsesFully = (text: string) => {
    const cst = parseToCST(text, 0, "combinator", metaGrammar, "combinator");
    expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
    expect(cst.end).toBe(text.length);
};

/** A combinator's description must be matched in full by the metagrammar. */
const roundTrips = (node: GrammarCombinator) => parsesFully(describeCombinator(node));

describe("metagrammar: one form per operation", () => {
    test("literal", () => {
        roundTrips(lit("abc"));
        roundTrips(lit(""));
        roundTrips(regex(/[a-z]+/));
        roundTrips(regex(/[^"\\]+/));
        roundTrips(regex(/[\]]/));
    });
    test("keyword", () => {
        roundTrips(kw("keyword", "in"));
        roundTrips(kw("keyword", "if", "then", "else"));
    });
    test("ignored", () => roundTrips(ignored(rule("blank"))));
    test("rule", () => {
        roundTrips(rule("expr"));
        roundTrips(rule("body_exprs", kw("keyword", "end"), eps()));
    });
    test("param", () => {
        roundTrips(param("end"));
        roundTrips(param("end", eps()));
    });
    test("ambient", () => {
        roundTrips(ambient("guard"));
        roundTrips(ambient("guard", eps()));
    });
    test("bind", () => {
        roundTrips(bind("guard", eps(), rule("expr")));
        roundTrips(bind("guard", lookahead(false, kw("keyword", "end")), seq(rule("a"), rule("b"))));
    });
    test("sequence", () => {
        roundTrips(seq(lit("a"), rule("b"), lit("c")));
        roundTrips(seq(rule("only")));
        roundTrips(ssep(rule("blank"), kw("keyword", "do", "begin"), rule("body_exprs")));
    });
    test("alternatives", () => {
        roundTrips(alt(lit("a"), lit("b")));
        roundTrips(altFirst(rule("block_expr"), rule("simple_expr")));
        roundTrips(no());
    });
    test("optional", () => roundTrips(opt(kw("keyword", "then"))));
    test("repeat", () => {
        roundTrips(rep(false, rule("blank")));
        roundTrips(rep(true, seq(rule("a"), lit(","))));
    });
    test("joined", () => roundTrips(joined(ignored(rule("ws_comma")), rule("item"), false, true)));
    test("if", () => roundTrips(if_(eps(), lit("a"), lit("b"))));
    test("tag", () => roundTrips(tag("operator", lit("+"))));
    test("cut", () => roundTrips(cut()));
    test("lookahead", () => {
        roundTrips(lookahead(true, rule("x")));
        roundTrips(lookahead(false, kw("keyword", "catch", "finally", "else", "end")));
    });
    test("nonempty", () => roundTrips(nonempty(rule("implicit_args"))));
    test("sameline", () => roundTrips(sameline(rule("blank"))));
    test("nothing", () => roundTrips(eps()));
    test("try", () => roundTrips(try_(rule("implicit_args"))));
    test("die", () => roundTrips(die("expected a thing")));
});

describe("metagrammar: the whole Backolon grammar round-trips", () => {
    for (const [name, entry] of Object.entries(backolonGrammar)) {
        test(name, () => roundTrips(Array.isArray(entry) ? entry[1] : entry));
    }
});
