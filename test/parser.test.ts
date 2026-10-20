import { expect, test, describe } from "bun:test";
import { alt, backolonGrammar, CSTNode, Grammar, kw, lit, opt, param, parseToCST, regex, rule, seq } from "../src";

/** Parse with a synthetic grammar and require a full, error-free parse. */
const parsesFully = (grammar: Grammar, start: string, text: string): CSTNode => {
    const cst = parseToCST(text, 0, start, grammar, "exprs");
    expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
    expect(cst.end).toBe(text.length);
    return cst;
};

describe("parameterized rules", () => {
    test("an argument combinator is matched where the body says param", () => {
        const grammar: Grammar = {
            main: rule("wrap", lit("("), lit(")")),
            wrap: [["open", "close"], seq(param("open"), rule("word"), param("close"))],
            word: regex(/[a-z]+/),
        };
        parsesFully(grammar, "main", "(abc)");
        // a different instance of the same rule, with different arguments
        const grammar2: Grammar = { ...grammar, main: rule("wrap", lit("["), lit("]")) };
        parsesFully(grammar2, "main", "[abc]");
    });

    test("instances memoize separately: a failed instance does not poison a later one at the same index", () => {
        const grammar: Grammar = {
            main: alt(rule("w", lit("a")), rule("w", lit("b"))),
            w: [["t"], seq(param("t"), lit("!"))],
        };
        // w(a) fails on this input; w(b) at the same index must still be tried fresh
        parsesFully(grammar, "main", "b!");
    });

    test("arguments are evaluated in the call site's scope (call by name)", () => {
        const grammar: Grammar = {
            main: rule("outer", lit("go")),
            // outer passes its own parameter on to inner; inner's parameter
            // must still see outer's argument, not anything of inner's
            outer: [["x"], rule("inner", param("x"))],
            inner: [["y"], seq(param("y"), lit(";"))],
        };
        parsesFully(grammar, "main", "go;");
    });

    test("an inner binding shadows an outer parameter of the same name", () => {
        const grammar: Grammar = {
            main: rule("outer", lit("A")),
            outer: [["x"], seq(rule("inner", lit("B")), param("x"))],
            inner: [["x"], param("x")],
        };
        // inner's x is "B"; outer's own x is still "A" afterwards
        parsesFully(grammar, "main", "BA");
    });

    test("a parameterized rule can be left-recursive, per instance", () => {
        const grammar: Grammar = {
            main: seq(rule("e", lit("+")), lit(" "), rule("e", lit("-"))),
            e: [["op"], alt(
                seq(rule("e", param("op")), param("op"), rule("num")),
                rule("num"),
            )],
            num: regex(/[0-9]+/),
        };
        parsesFully(grammar, "main", "1+2 3-4");
    });

    test("arguments are required and checked", () => {
        const needsOne: Grammar = {
            main: rule("w"),
            w: [["t"], param("t")],
        };
        expect(() => parseToCST("a", 0, "main", needsOne, "exprs")).toThrow("takes 1 argument(s) but got 0");
        const plainWithArgs: Grammar = {
            main: rule("w", lit("a")),
            w: lit("a"),
        };
        expect(() => parseToCST("a", 0, "main", plainWithArgs, "exprs")).toThrow("takes no arguments");
        const unbound: Grammar = {
            main: rule("w", lit("a")),
            w: [["t"], param("other")],
        };
        expect(() => parseToCST("a", 0, "main", unbound, "exprs")).toThrow("unbound rule parameter other");
    });
});

describe("parameterized body_exprs", () => {
    // body_exprs takes the keyword(s) that may end the block as an argument,
    // so each block construct can declare its own terminators.
    const withTerminators = (...terminators: string[]): Grammar => ({
        ...backolonGrammar,
        main: seq(lit("if "), rule("body_exprs", kw("keyword", ...terminators))),
    });

    test("the body stops at, and consumes, a terminator from the argument list", () => {
        parsesFully(withTerminators("else", "end"), "main", "if a b else");
        parsesFully(withTerminators("else", "end"), "main", "if a\nb\nelse");
        parsesFully(withTerminators("else", "end"), "main", "if a b end");
    });

    test("a keyword not in the argument list does not end the body", () => {
        const cst = parseToCST("if a b else", 0, "main", withTerminators("end"), "exprs");
        expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
        // the body parsed "a b" and stopped before "else" (only the
        // separator blank after it was consumed)
        expect(cst.end).toBe("if a b ".length);
    });
});
