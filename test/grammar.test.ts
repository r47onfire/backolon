import { expect, test, describe } from "bun:test";
import { backolonGrammar, CSTNode, parseToCST, describe as describeGrammar } from "../src";

type ASTNode = string | number | undefined | ASTNode[];
const toAST = (cst: CSTNode): ASTNode => {
    const c = () => cst.children?.filter(c => !c.ignored).flatMap(c => c.type ? [toAST(c)] : toAST(c)) ?? [];
    if (cst.errorExpected) return [cst.type, describeGrammar(cst.errorExpected), cst.end, cst.text];
    if (cst.type) return [cst.type, ...c()];
    if (cst.children) return c();
    return cst.text;
}

const parse = (text: string): CSTNode => {
    const cst = parseToCST(text, 0, "toplevel_exprs", backolonGrammar, "exprs");
    // console.log(text, "==>", JSON.stringify(toAST(cst), null, 2));
    return cst as CSTNode;
};

/** like the CSV test: concatenating the leaves must exactly reproduce the source span */
const leaves = (node: CSTNode): string[] => {
    if (node.children === undefined || node.children.length === 0) return [node.text ?? ""];
    return node.children.flatMap(leaves);
};
const checkSource = (node: CSTNode, source: string): void => {
    expect(leaves(node).join("")).toBe(source.slice(node.start, node.end));
};

const parsesFully = (text: string): CSTNode => {
    const cst = parse(text);
    expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
    expect(cst.end).toBe(text.length);
    checkSource(cst, text);
    return cst;
};

describe("numbers", () => {
    test.each(([
        ["123", "decimal"],
        ["3.14", "decimal"],
        [".5", "decimal"],
        ["0x1F", "hex"],
        ["0xc0ffee", "hex"],
        ["1.e+4", "decimal"],
    ] satisfies [string, string][]).map(([a, b]) => [JSON.stringify(a), a, b]))("%s", (_, str, type) => {
        expect(toAST(parsesFully(str))).toEqual(["exprs", ["number", [type, str]]])
    });
});

describe("names", () => {
    test.each([
        "foo",
        "_",
        "foo123",
        "_bar",
        "in",
        "end",
        "fn",
    ])("%s", (text) => {
        const ast = toAST(parsesFully(text));
        expect(ast).toEqual(["exprs", ["name", text]]);
    });
});

describe("strings", () => {
    test("hello", () => expect(toAST(parsesFully(`"hello"`))).toEqual(["exprs", ["i_string", ["i_body", "hello"]]]));
    test("raw", () => expect(toAST(parsesFully(`'single'`))).toEqual(["exprs", ["r_string", ["r_body", "single"]]]));
    test("interpolation", () => {
        // interpolation contains i_interpolation node
        const ast = toAST(parsesFully(`"fizzbuzz: \\(n) mississippi"`));
        expect(JSON.stringify(ast)).toContain("i_interpolation");
    });
    // escapes
    test("escape normal", () => void parsesFully(`"a\\"b"`));
    test("escape raw", () => void parsesFully(`'it\\'s'`));
});

describe("comments/separators", () => {
    test.each(([
        [`## hello\nprint 1`, 1],
        [`print 1; print 2`, 2],
        [`print 1\nprint 2`, 2],
        [`print 1;;;;;;;;;print 2`, 2],
        [`;print 1;`, 1],
        [`print 1 ## trailing\nprint 2`, 2],
        [`##[[\nprint 1\n##]]`, 0],
        [`###[[\nprint 1\n##]]`, 1],
        [`##[[\nprint 1\n##]]\nprint 1\n##[[\nprint 1\n##]]`, 1],
    ] satisfies [string, number][]).map(([a, b]) => [JSON.stringify(a), a, b]))("%s", (_, text, calls) => {
        const ast = toAST(parsesFully(text));
        expect(JSON.stringify(ast).split('"implicit_call"').length - 1).toEqual(calls);
    });
});

describe("precedence/associativity", () => {
    test.each(([
        // 1 + 2 * 3 : the sum's right operand is a term (2 * 3)
        [`1 + 2 * 3`, ["exprs", ["sum", ["number", ["decimal", "1"]], ["add", "+"], ["term", ["number", ["decimal", "2"]], ["mul", "*"], ["number", ["decimal", "3"]]]]]],
        // (1 + 2) * 3 : the term's left operand is a par_exp
        [`(1 + 2) * 3`, ["exprs", ["term", ["par_exp", ["exprs", ["sum", ["number", ["decimal", "1"]], ["add", "+"], ["number", ["decimal", "2"]]]]], ["mul", "*"], ["number", ["decimal", "3"]]]]],
        // left assoc: 1 + 2 + 3 nests the sum on the left
        [`1 + 2 + 3`, ["exprs", ["sum", ["sum", ["number", ["decimal", "1"]], ["add", "+"], ["number", ["decimal", "2"]]], ["add", "+"], ["number", ["decimal", "3"]]]]],
        // right assoc pow: 2 ** 3 ** 2 nests factor on the right
        [`2 ** 3 ** 2`, ["exprs", ["factor", ["number", ["decimal", "2"]], ["pow", "**"], ["factor", ["number", ["decimal", "3"]], ["pow", "**"], ["number", ["decimal", "2"]]]]]],
        // -2 ** 2 is -(2 ** 2): prefix outside the factor
        [`-2 ** 2`, ["exprs", ["prefix", ["negate", "-"], ["factor", ["number", ["decimal", "2"]], ["pow", "**"], ["number", ["decimal", "2"]]]]]],
        // a * -b : term takes a prefix operand
        [`a * -b`, ["exprs", ["term", ["name", "a"], ["mul", "*"], ["prefix", ["negate", "-"], ["name", "b"]]]]],
        // -0.8-8 : (-0.8) - 8
        [`-0.8-8`, ["exprs", ["sum", ["prefix", ["negate", "-"], ["number", ["decimal", "0.8"]]], ["sub", "-"], ["number", ["decimal", "8"]]]]],
        // Right associative: a = (b <- 1)
        [`a = b <- 1`, ["exprs", ["assignment", ["name", "a"], ["normal_assign", "="], ["assignment", ["name", "b"], ["old_assign", "<-"], ["number", ["decimal", "1"]]]]]],
        // Augmented assignment
        [`a += b /= c`, ["exprs", ["assignment", ["name", "a"], ["aug_assign", ["add", "+"], ["normal_assign", "="]], ["assignment", ["name", "b"], ["aug_assign", ["div", "/"], ["normal_assign", "="]], ["name", "c"]]]]],
    ] satisfies [string, ASTNode][]).map(([a, b]) => [JSON.stringify(a), a, b]))("%s", (_, text, ast) => {
        expect(toAST(parsesFully(text))).toEqual(ast);
    });
});

describe("calls", () => {
    // TODO: i'm not sure what this actually is supposed to do
    test.failing("print(1, 2), 3", () => void parsesFully("print(1, 2), 3"));
    test.each(([
        [`print(1, 2)`, ["exprs", ["explicit_call", ["name", "print"], ["explicit_args", ["number", ["decimal", "1"]], ["number", ["decimal", "2"]]]]]],
        [`print (1, 2)`, ["exprs", ["explicit_call", ["name", "print"], ["explicit_args", ["number", ["decimal", "1"]], ["number", ["decimal", "2"]]]]]],
        [`print 1, 2`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]], ["number", ["decimal", "2"]]]]]],
        // juxtaposition is right-nested: 'print print 1, 2' parses as 'print(print(1, 2))'
        [`print print 1, 2`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]], ["number", ["decimal", "2"]]]]]]]],
        // zero args
        [`print()`, ["exprs", ["explicit_call", ["name", "print"], ["explicit_args"]]]],
        // (1,,2) has an empty middle arg (null)
        [`print(1,,2)`, ["exprs", ["explicit_call", ["name", "print"], ["explicit_args", ["number", ["decimal", "1"]], ["empty_arg", undefined], ["number", ["decimal", "2"]]]]]],
        [`print 1,,2`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]], ["empty_arg", undefined], ["number", ["decimal", "2"]]]]]],
        // chained calls: f(x)(y)
        [`print(1)(2)`, ["exprs", ["explicit_call", ["explicit_call", ["name", "print"], ["explicit_args", ["number", ["decimal", "1"]]]], ["explicit_args", ["number", ["decimal", "2"]]]]]],
        // bare name is NOT a call
        [`print`, ["exprs", ["name", "print"]]],
    ] satisfies [string, ASTNode][]).map(([a, b]) => [JSON.stringify(a), a, b]))("%s", (_, text, ast) => {
        expect(toAST(parsesFully(text))).toEqual(ast);
    });
});

describe("unary operators", () => {
    test.each(([
        [`-x`, ["exprs", ["prefix", ["negate", "-"], ["name", "x"]]]],
        [`!ok`, ["exprs", ["prefix", ["not", "!"], ["name", "ok"]]]],
        [`#x`, ["exprs", ["prefix", ["length", "#"], ["name", "x"]]]],
        [`#"str"`, ["exprs", ["prefix", ["length", "#"], ["i_string", ["i_body", "str"]]]]],
        //  ...args (splat)
        [`...args`, ["exprs", ["prefix", ["spread", "..."], ["name", "args"]]]],
        //  != is a comparison, not ! followed by =
        [`a != b`, ["exprs", ["comparison", ["name", "a"], ["not_equal", "!="], ["name", "b"]]]],
    ] satisfies [string, ASTNode][]).map(([a, b]) => [JSON.stringify(a), a, b]))("%s", (_, text, ast) => {
        expect(toAST(parsesFully(text))).toEqual(ast);
    });
});

describe("indexing", () => {
    test.each(([
        //  a.b.c is left-nested: (a.b).c
        [`a.b.c`, ["exprs", ["indexing", ["indexing", ["name", "a"], ["dot", "."], ["name", "b"]], ["dot", "."], ["name", "c"]]]],
        // test it works with assignment
        [`a.b.c = d.e.f`, ["exprs", ["assignment", ["indexing", ["indexing", ["name", "a"], ["dot", "."], ["name", "b"]], ["dot", "."], ["name", "c"]], ["normal_assign", "="], ["indexing", ["indexing", ["name", "d"], ["dot", "."], ["name", "e"]], ["dot", "."], ["name", "f"]]]]],
        // indexing binds TIGHTER than referencing!
        [`&x.y`, ["exprs", ["prefix", ["ref", "&"], ["indexing", ["name", "x"], ["dot", "."], ["name", "y"]]]]],
        [`&x->y`, ["exprs", ["prefix", ["ref", "&"], ["indexing", ["name", "x"], ["arrow", "->"], ["name", "y"]]]]],
        [`(*x).y`, ["exprs", ["indexing", ["par_exp", ["exprs", ["prefix", ["deref", "*"], ["name", "x"]]]], ["dot", "."], ["name", "y"]]]],
    ] satisfies [string, ASTNode][]).map(([a, b]) => [JSON.stringify(a), a, b]))("%s", (_, text, ast) => {
        expect(toAST(parsesFully(text))).toEqual(ast);
    });
});

test("pipes", () => {
    // pipes are left-nested: (a |> b it) |> c it
    const ast = toAST(parsesFully(`a |> b it |> c it`));
    expect(ast).toEqual(["exprs", ["pipe", ["pipe", ["name", "a"], ["normal_pipe", "|>"], ["implicit_call", ["name", "b"], ["implicit_args", ["name", "it"]]]], ["normal_pipe", "|>"], ["implicit_call", ["name", "c"], ["implicit_args", ["name", "it"]]]]]);
    // pipe variants parse (except |+> without brackets, see README test)
    parsesFully(`["hello", "world", "!"] |?> it != "!" |*> upper it`);
});

test("ternary", () => {
    expect(toAST(parsesFully(`a ? b : c`))).toEqual(
        ["exprs", ["ternary", ["name", "a"], "?", ["name", "b"], ":", ["name", "c"]]]
    );
    // nested, right associative
    parsesFully(`n % 15 == 0 ? "fizzbuzz" : n % 5 == 0 ? "buzz" : "\\(n)"`);
});

test("let", () => {
    // TODO: let_body is not yet defined in the grammar
    // Once implemented:
    // - `let a = 1` should be a simple var (not a call)
    // - `let x = 1, y = 2 in foo x end` should be a let_block
    // - `let(loop) x = 1 in foo loop end` should be a let_loop
});

test("foreach", () => {
    // TODO: foreach_body is not yet defined in the grammar
    // Once implemented:
    // - `foreach i in range(1, 100) do\n    print fizzbuzz i\nend` should parse
    // - `foreach i in x do print i end` should parse
});

test("lambdas", () => {
    // TODO: fn_body is not yet defined in the grammar
    // Once implemented:
    // - `fn(x) x + 1` (inline) should parse
    // - `fn(x)\n    x + 1\nend` (block) should parse
    // - `fn(x, y, z...) x` (rest params) should parse
    // - `callcc fn(c) c` (lambda as implicit-call arg) should parse
});

test("lists and objects", () => {
    const countType = (text: string, type: string): number => {
        const ast = toAST(parsesFully(text));
        return JSON.stringify(ast).split(`"${type}"`).length - 1;
    };
    expect(countType(`[1, x, 3]`, "collection")).toBe(1);
    expect(countType(`[1, x, 3]`, "kw_arg")).toBe(0);
    expect(countType(`[]`, "collection")).toBe(1);
    expect(countType(`[foo: 1, bar: 2]`, "kw_arg")).toBe(2);
    expect(countType(`[:]`, "collection")).toBe(1);
    // ternary colon is not a pair
    expect(countType(`[a ? b : c]`, "kw_arg")).toBe(0);
    // empty list and empty map shapes
    expect(toAST(parsesFully(`[]`))).toEqual(["exprs", ["collection", ["empty_list", undefined]]]);
    expect(toAST(parsesFully(`[:]`))).toEqual(["exprs", ["collection", ["empty_map", ":"]]]);
    // shorthand
    expect(toAST(parsesFully("[`foo:]"))).toEqual(["exprs", ["collection", ["collection_body", ["collection_shorthand", ["quote", "`"], ["name", "foo"]]]]]);
    expect(toAST(parsesFully("[`foo:, `bar: baz]"))).toEqual(["exprs", ["collection", ["collection_body", ["collection_shorthand", ["quote", "`"], ["name", "foo"]], ["kw_arg", ["prefix", ["quote", "`"], ["name", "bar"]], ["kw", ":"], ["name", "baz"]]]]]);
});

describe("quotes", () => {
    test.each(([
        ["`(x + y)", ["exprs", ["prefix", ["quote", "`"], ["par_exp", ["exprs", ["sum", ["name", "x"], ["add", "+"], ["name", "y"]]]]]]],
        ["`name", ["exprs", ["prefix", ["quote", "`"], ["name", "name"]]]],
        ["``(x)", ["exprs", ["prefix", ["quote", "`"], ["prefix", ["quote", "`"], ["par_exp", ["exprs", ["name", "x"]]]]]]],
        ["{$x}", ["exprs", ["quasiquote", ["exprs", ["prefix", ["unquote", "$"], ["name", "x"]]]]]]
    ] satisfies [string, ASTNode][]).map(([a, b]) => [JSON.stringify(a), a, b]))("%s", (_, text, ast) => {
        expect(toAST(parsesFully(text))).toEqual(ast);
    });
});

test("parens", () => {
    parsesFully(`(1 + 2) * 3`);
    parsesFully(`(print 1; print 2)`);
    parsesFully(`(a)`);
    parsesFully(`()`);
    parsesFully(`(f)(x)`);
});

test("soft keywords stay usable as names, never as call args", () => {
    // soft keywords usable as names
    expect(toAST(parsesFully(`in`))).toEqual(["exprs", ["name", "in"]]);
    expect(toAST(parsesFully(`end`))).toEqual(["exprs", ["name", "end"]]);
    expect(toAST(parsesFully(`do`))).toEqual(["exprs", ["name", "do"]]);
    // TODO: `f in` currently parses `in` as a call arg; the soft-keyword
    // exclusion is missing in arg position. Once fixed, `f in` should parse
    // as just `f` with ` in` unconsumed.
});

test("README examples", () => {
    // Hello World
    expect(toAST(parsesFully(`print "Hello, World!"`))).toEqual([
        "exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["i_string", ["i_body", "Hello, World!"]]]]
    ]);

    // Pipe chain (partial: |+> requires [...] in current grammar)
    // TODO: `|+> _ + it` without brackets doesn't parse; grammar expects `|+>[...]`
    parsesFully(`["hello", "world", "!"] |?> it != "!" |*> upper it`);

    // TODO: let/fn/foreach bodies not yet defined in grammar
    // - `let fizzbuzz = fn(n) ...` (fizzbuzz with ternary)
    // - `foreach i in range(1, 100) do\n    print fizzbuzz i\nend`
    // - yin/yang line
});

/** every error node (type "BAD", i.e. has errorExpected) under node, in document order */
const errorNodes = (node: CSTNode): CSTNode[] => [
    ...(node.errorExpected !== undefined ? [node] : []),
    ...(node.children ?? []).flatMap(errorNodes),
];

describe("error nodes", () => {
    // "@" is the reference operator with a missing operand: one error covering just the "@"
    test("@", () => {
        const text = "@";
        const cst = parse(text);
        expect(cst.end).toBe(text.length);
        checkSource(cst, text);
        const errors = errorNodes(cst);
        expect(errors).toHaveLength(1);
        expect([errors[0]!.start, errors[0]!.end, errors[0]!.text]).toEqual([0, 1, "@"]);
    });
    // "1 + % 2": "%" can't start a term, but the "2" after it is recovered as a number, and the result should be 1 + 2
    test("%", () => {
        const text = "1 + % 2";
        const cst = parse(text);
        expect(cst.end).toBe(text.length);
        checkSource(cst, text);
        const errors = errorNodes(cst);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.end).toBeLessThanOrEqual(6); // the error is before the recovered "2"
        const str = JSON.stringify(toAST(cst));
        expect(str).toContain(`"decimal","1"`);
        expect(str).toContain(`"decimal","2"`);
        expect(str).toContain(`"sum"`); // the "1 +" is preserved as a sum, not discarded
    });
    // "(+)" is invalid since + needs at least an argument after it
    test("(+)", () => {
        const text = "1 + (+) + 1";
        const cst = parse(text);
        expect(cst.end).toBe(text.length);
        checkSource(cst, text);
        const errors = errorNodes(cst);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.text).toBe("+");
        expect([errors[0]!.start, errors[0]!.end]).toEqual([5, 6]);
        // add(add(1, BAD), 1): nested sums, error inside the inner one, not toplevel
        const ast = toAST(cst) as ASTNode[];
        expect(ast[0]).toBe("exprs");
        const outer = ast[1] as ASTNode[];
        expect(outer[0]).toBe("sum");
        expect((outer[1] as ASTNode[])[0]).toBe("sum");
    });

    test("++%++", () => {
        const text = "1 + 1 + % 1 + 1 + 1";
        const cst = parse(text);
        expect(cst.end).toBe(text.length);
        checkSource(cst, text);
        const errors = errorNodes(cst);
        expect(errors).toHaveLength(1);
    });
});
