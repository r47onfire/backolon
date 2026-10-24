import { expect, test, describe } from "bun:test";
import { alt, ambient, backolonGrammar, bind, CSTNode, nothing, Grammar, kw, lit, opt, param, parseToCST, regex, rule, seq } from "../src";

/** Parse with a synthetic grammar and require a full, error-free parse. */
const parsesFully = (grammar: Grammar, start: string, text: string): CSTNode => {
    const cst = parseToCST(text, 0, start, grammar, "exprs");
    expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
    expect(cst.end).toBe(text.length);
    return cst;
};

describe("parameterized rules", () => {
    test("param matches the given argument", () => {
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

    test("parameters change the memo key", () => {
        const grammar: Grammar = {
            main: alt(rule("w", lit("a")), rule("w", lit("b"))),
            w: [["t"], seq(param("t"), lit("!"))],
        };
        // w(a) fails on this input; w(b) at the same index must still be tried fresh
        parsesFully(grammar, "main", "b!");
    });

    test("call by name on parameters", () => {
        const grammar: Grammar = {
            main: rule("outer", lit("go")),
            // outer passes its own parameter on to inner; inner's parameter
            // must still see outer's argument, not anything of inner's
            outer: [["x"], rule("inner", param("x"))],
            inner: [["y"], seq(param("y"), lit(";"))],
        };
        parsesFully(grammar, "main", "go;");
    });

    test("shadowing by name", () => {
        const grammar: Grammar = {
            main: rule("outer", lit("A")),
            outer: [["x"], seq(rule("inner", lit("B")), param("x"))],
            inner: [["x"], param("x")],
        };
        // inner's x is "B"; outer's own x is still "A" afterwards
        parsesFully(grammar, "main", "BA");
    });

    test("parameterized rule left-recursive per instance", () => {
        const grammar: Grammar = {
            main: seq(rule("e", lit("+")), lit(" "), rule("e", lit("-"))),
            e: [["op"], alt(
                seq(rule("e", param("op")), param("op"), rule("num")),
                rule("num"),
            )],
            num: regex(/[0-9]+/),
        };
        parsesFully(grammar, "main", "1+2+3 4-5-6");
    });

    test("check arguments", () => {
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

describe("dynamic parameters", () => {
    test("visible across rule boundaries", () => {
        const grammar: Grammar = {
            main: bind("term", false, lit("!"), rule("a")),
            a: rule("b"),
            b: seq(lit("x"), ambient("term")),
        };
        parsesFully(grammar, "main", "x!");
    });

    test("extent of shadowing", () => {
        const grammar: Grammar = {
            main: bind("t", false, lit("a"), seq(rule("inner"), ambient("t"))),
            inner: bind("t", false, lit("b"), ambient("t")),
        };
        // inner sees "b"; the outer binding is in effect again afterwards
        parsesFully(grammar, "main", "ba");
    });

    test("can reference the parent value in their own definition", () => {
        const grammar: Grammar = {
            main: bind("t", false, lit("a"), bind("t", false, seq(ambient("t"), lit("b")), ambient("t"))),
        };
        parsesFully(grammar, "main", "ab");
    });

    test("clear binding by setting it to eps", () => {
        const grammar: Grammar = {
            main: bind("t", false, lit("z"), seq(bind("t", false, nothing(), ambient("t")), ambient("t"))),
        };
        // inside the inner bind the parameter matches nothing; outside, "z" again
        parsesFully(grammar, "main", "z");
    });

    test("memoization keys on ambient context too", () => {
        const grammar: Grammar = {
            main: alt(bind("t", false, lit("a"), rule("h")), bind("t", false, lit("b"), rule("h"))),
            h: seq(ambient("t"), lit("!")),
        };
        // h fails under t="a" on this input; under t="b" it must be tried fresh
        parsesFully(grammar, "main", "b!");
    });

    test("can work with lexical parameters", () => {
        const grammar: Grammar = {
            main: bind("x", false, lit("D"), rule("outer", lit("L"))),
            outer: [["x"], seq(param("x"), rule("inner", param("x")))],
            inner: [["y"], seq(param("y"), ambient("x"))],
        };
        // param("x") is outer's lexical argument "L" (the dynamic binding
        // does not capture it), it passes onward as inner's "y" unchanged,
        // and ambient("x") is the dynamic binding "D"
        parsesFully(grammar, "main", "LLD");
    });

    test("can still be left-recursive", () => {
        const grammar: Grammar = {
            main: bind("op", false, lit("+"), rule("e")),
            e: alt(seq(rule("e"), ambient("op"), rule("num")), rule("num")),
            num: regex(/[0-9]+/),
        };
        parsesFully(grammar, "main", "1+2");
    });

    test("unbound dynamic parameter", () => {
        const grammar: Grammar = { main: ambient("nope") };
        expect(() => parseToCST("a", 0, "main", grammar, "exprs")).toThrow("unbound dynamic parameter nope");
    });
});

describe("parameter defaults", () => {
    test("evaluated when the parameter is unbound", () => {
        const grammar: Grammar = {
            main: seq(lit("hello "), param("notdefined", lit("world"))),
        };
        parsesFully(grammar, "main", "hello world");
    });

    test("bound parameter wins", () => {
        const grammar: Grammar = {
            main: rule("w", lit("rulevalue")),
            w: [["x"], param("x", lit("default"))],
        };
        parsesFully(grammar, "main", "rulevalue");
        const cst = parseToCST("default", 0, "main", grammar, "exprs");
        expect(JSON.stringify(cst)).toContain('"errorExpected"');
    });

    test("works inside rule arguments", () => {
        const grammar: Grammar = {
            main: rule("w", param("missing", lit("abc"))),
            w: [["a"], param("a")],
        };
        parsesFully(grammar, "main", "abc");
    });

    test("ambient default still evaluated when no bind is in effect", () => {
        const grammar: Grammar = {
            main: seq(lit("a"), ambient("sep", lit("b"))),
        };
        parsesFully(grammar, "main", "ab");
    });

    test("binding wins over an ambient default, resolves in the reference site's context", () => {
        const bound: Grammar = {
            main: bind("sep", false, lit("good"), ambient("sep", lit("bad"))),
        };
        parsesFully(bound, "main", "good");
        // the default itself can read other ambient values in effect at the reference
        const nested: Grammar = {
            main: bind("a", false, lit("abc"), ambient("notdefined", ambient("a"))),
        };
        parsesFully(nested, "main", "abc");
    });
});
