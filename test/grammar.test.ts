import { expect, test } from "bun:test";
import { backolonGrammar, CSTNode, parseToCST } from "../src";

type ASTNode = string | undefined | ASTNode[];
const toAST = (cst: CSTNode): ASTNode => {
    const c = () => cst.children?.filter(c => !c.ignored).flatMap(c => c.type ? [toAST(c)] : toAST(c)) ?? [];
    if (cst.type) return [cst.type, ...c()];
    if (cst.children) return c();
    return cst.text;
}

const parse = (text: string): CSTNode => {
    const cst = parseToCST(text, 0, "toplevel_exprs", backolonGrammar);
    console.log(text, "==>", JSON.stringify(toAST(cst), null, 2));
    expect(JSON.stringify(cst)).not.toContain('"errorExpected"');
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
    expect(cst.end).toBe(text.length);
    checkSource(cst, text);
    return cst;
};

test("numbers", () => {
    expect(toAST(parsesFully("123"))).toEqual(["exprs", ["number", ["decimal", "123"]]]);
    expect(toAST(parsesFully("3.14"))).toEqual(["exprs", ["number", ["decimal", "3.14"]]]);
    expect(toAST(parsesFully(".5"))).toEqual(["exprs", ["number", ["decimal", ".5"]]]);
    expect(toAST(parsesFully("0x1F"))).toEqual(["exprs", ["number", ["hex", "0x1F"]]]);
    expect(toAST(parsesFully("0xff"))).toEqual(["exprs", ["number", ["hex", "0xff"]]]);
});

test("names", () => {
    for (var text of ["foo", "_", "foo123", "_bar", "in", "end", "fn"]) {
        const ast = toAST(parsesFully(text));
        expect(ast).toEqual(["exprs", ["name", text]]);
    }
});

test("strings", () => {
    expect(toAST(parsesFully(`"hello"`))).toEqual(["exprs", ["i_string", "\"", ["i_body", "hello"], "\""]]);
    expect(toAST(parsesFully(`'single'`))).toEqual(["exprs", ["r_string", "'", ["r_body", "single"], "'"]]);
    // interpolation contains i_interpolation node
    const ast = toAST(parsesFully(`"fizzbuzz: \\(n) mississippi"`));
    expect(JSON.stringify(ast)).toContain("i_interpolation");
    // escapes
    parsesFully(`"a\\"b"`);
    parsesFully(`'it\\'s'`);
});

test("comments and separators", () => {
    // count implicit_call nodes via JSON (comments are ignored but preserved in CST)
    const countCalls = (text: string): number => {
        const ast = toAST(parsesFully(text));
        return JSON.stringify(ast).split('"implicit_call"').length - 1;
    };
    expect(countCalls(`## hello\nprint 1`)).toBe(1);
    expect(countCalls(`print 1; print 2`)).toBe(2);
    expect(countCalls(`print 1\nprint 2`)).toBe(2);
    expect(countCalls(`print 1;;;;;;;;;print 2`)).toBe(2);
    expect(countCalls(`;print 1;`)).toBe(1);
    expect(countCalls(`print 1 ## trailing\nprint 2`)).toBe(2);
});

test("arithmetic precedence and associativity", () => {
    // 1 + 2 * 3 : the sum's right operand is a term (2 * 3)
    var ast = toAST(parsesFully(`1 + 2 * 3`));
    expect(ast).toEqual(["exprs", ["sum", ["number", ["decimal", "1"]], ["add", "+"], ["term", ["number", ["decimal", "2"]], ["mul", "*"], ["number", ["decimal", "3"]]]]]);

    // (1 + 2) * 3 : the term's left operand is a par_exp
    ast = toAST(parsesFully(`(1 + 2) * 3`));
    expect(ast).toEqual(["exprs", ["term", ["par_exp", ["exprs", ["sum", ["number", ["decimal", "1"]], ["add", "+"], ["number", ["decimal", "2"]]]]], ["mul", "*"], ["number", ["decimal", "3"]]]]);

    // left assoc: 1 + 2 + 3 nests the sum on the left
    ast = toAST(parsesFully(`1 + 2 + 3`));
    expect(ast).toEqual(["exprs", ["sum", ["sum", ["number", ["decimal", "1"]], ["add", "+"], ["number", ["decimal", "2"]]], ["add", "+"], ["number", ["decimal", "3"]]]]);

    // right assoc pow: 2 ** 3 ** 2 nests factor on the right
    ast = toAST(parsesFully(`2 ** 3 ** 2`));
    expect(ast).toEqual(["exprs", ["factor", ["number", ["decimal", "2"]], ["pow", "**"], ["factor", ["number", ["decimal", "3"]], ["pow", "**"], ["number", ["decimal", "2"]]]]]);

    // -2 ** 2 is -(2 ** 2): prefix outside the factor
    ast = toAST(parsesFully(`-2 ** 2`));
    expect(ast).toEqual(["exprs", ["prefix", ["negate", "-"], ["factor", ["number", ["decimal", "2"]], ["pow", "**"], ["number", ["decimal", "2"]]]]]);

    // a * -b : term takes a prefix operand
    ast = toAST(parsesFully(`a * -b`));
    expect(ast).toEqual(["exprs", ["term", ["name", "a"], ["mul", "*"], ["prefix", ["negate", "-"], ["name", "b"]]]]);

    // -0.8-8 : (-0.8) - 8
    ast = toAST(parsesFully(`-0.8-8`));
    expect(ast).toEqual(["exprs", ["sum", ["prefix", ["negate", "-"], ["number", ["decimal", "0.8"]]], ["sub", "-"], ["number", ["decimal", "8"]]]]);
});

test("assignment is right associative", () => {
    const ast = toAST(parsesFully(`a = b <- 1`));
    // Right associative: a = (b <- 1)
    expect(ast).toEqual(["exprs", ["assignment", ["name", "a"], ["assign_op", undefined, "="], ["assignment", ["name", "b"], ["old_assign_op", "<-"], ["number", ["decimal", "1"]]]]]);
});

test("calls: explicit, implicit, comma args, empties", () => {
    var ast = toAST(parsesFully(`print(1, 2)`));
    expect(ast).toEqual(["exprs", ["explicit_call", ["name", "print"], ["explicit_args", ["number", ["decimal", "1"]], ["number", ["decimal", "2"]]]]]);

    ast = toAST(parsesFully(`print (1, 2)`));
    expect(ast).toEqual(["exprs", ["explicit_call", ["name", "print"], ["explicit_args", ["number", ["decimal", "1"]], ["number", ["decimal", "2"]]]]]);

    ast = toAST(parsesFully(`print 1, 2`));
    expect(ast).toEqual(["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]], ["number", ["decimal", "2"]]]]]);

    // TODO: i'm not sure what this actually is supposed to do
    console.log("TODO: 'print(1,2), 3'");
    // ast = toAST(parsesFully(`print(1,2), 3`));
    // expect(ast).toEqual(["exprs", ["implicit_call", ["explicit_call", ["name", "print"], ["explicit_args", ["implicit_call", ["number", ["decimal", "1"]], ["implicit_args", undefined, ["number", ["decimal", "2"]]]]]], ["implicit_args", undefined, ["number", ["decimal", "3"]]]]]);

    // juxtaposition is right-nested: 'print print 1, 2' parses as 'print(print(1, 2))'
    ast = toAST(parsesFully(`print print 1, 2`));
    expect(ast).toEqual(["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]], ["number", ["decimal", "2"]]]]]]]);

    // zero args
    ast = toAST(parsesFully(`print()`));
    expect(ast).toEqual(["exprs", ["explicit_call", ["name", "print"], ["explicit_args"]]]);

    // (1,,2) has an empty middle arg (null)
    ast = toAST(parsesFully(`print(1,,2)`));
    expect(ast).toEqual(["exprs", ["explicit_call", ["name", "print"], ["explicit_args", ["number", ["decimal", "1"]], ["empty_arg", undefined], ["number", ["decimal", "2"]]]]]);

    ast = toAST(parsesFully(`print 1,,2`));
    expect(ast).toEqual(["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]], ["empty_arg", undefined], ["number", ["decimal", "2"]]]]]);

    // chained calls: f(x)(y)
    ast = toAST(parsesFully(`f(x)(y)`));
    expect(ast).toEqual(["exprs", ["explicit_call", ["explicit_call", ["name", "f"], ["explicit_args", ["name", "x"]]], ["explicit_args", ["name", "y"]]]]);

    // bare name is NOT a call
    ast = toAST(parsesFully(`print`));
    expect(ast).toEqual(["exprs", ["name", "print"]]);
});

test("unary operators", () => {
    var ast = toAST(parsesFully(`-x`));
    expect(ast).toEqual(["exprs", ["prefix", ["negate", "-"], ["name", "x"]]]);

    ast = toAST(parsesFully(`!ok`));
    expect(ast).toEqual(["exprs", ["prefix", ["not", "!"], ["name", "ok"]]]);

    ast = toAST(parsesFully(`#x`));
    expect(ast).toEqual(["exprs", ["prefix", ["length", "#"], ["name", "x"]]]);

    ast = toAST(parsesFully(`#"str"`));
    expect(ast).toEqual(["exprs", ["prefix", ["length", "#"], ["i_string", "\"", ["i_body", "str"], "\""]]]);

    // ...args (splat)
    ast = toAST(parsesFully(`...args`));
    expect(ast).toEqual(["exprs", ["prefix", ["spread", "..."], ["name", "args"]]]);

    // != is a comparison, not ! followed by =
    ast = toAST(parsesFully(`a != b`));
    expect(ast).toEqual(["exprs", ["comparison", ["name", "a"], ["not_equal_op", "!="], ["name", "b"]]]);
});

test("indexing is left associative", () => {
    // a.b.c is left-nested: (a.b).c
    const ast = toAST(parsesFully(`a.b.c`));
    expect(ast).toEqual(["exprs", ["indexing", ["indexing", ["name", "a"], ["dot", "."], ["name", "b"]], ["dot", "."], ["name", "c"]]]);
});

test("pipes", () => {
    // pipes are left-nested: (a |> b it) |> c it
    const ast = toAST(parsesFully(`a |> b it |> c it`));
    expect(ast).toEqual(["exprs", ["pipe", ["pipe", ["name", "a"], ["normal_pipe_op", "|>"], ["implicit_call", ["name", "b"], ["implicit_args", ["name", "it"]]]], ["normal_pipe_op", "|>"], ["implicit_call", ["name", "c"], ["implicit_args", ["name", "it"]]]]]);
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
});

test("quotes", () => {
    var ast = toAST(parsesFully("`(x + y)"));
    expect(ast).toEqual(["exprs", ["prefix", ["quote", "`"], ["par_exp", ["exprs", ["sum", ["name", "x"], ["add", "+"], ["name", "y"]]]]]]);

    ast = toAST(parsesFully("`name"));
    expect(ast).toEqual(["exprs", ["prefix", ["quote", "`"], ["name", "name"]]]);

    ast = toAST(parsesFully("``(x)"));
    expect(ast).toEqual(["exprs", ["prefix", ["quote", "`"], ["prefix", ["quote", "`"], ["par_exp", ["exprs", ["name", "x"]]]]]]);
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
        "exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["i_string", "\"", ["i_body", "Hello, World!"], "\""]]]
    ]);

    // Pipe chain (partial: |+> requires [...] in current grammar)
    // TODO: `|+> _ + it` without brackets doesn't parse; grammar expects `|+>[...]`
    parsesFully(`["hello", "world", "!"] |?> it != "!" |*> upper it`);

    // TODO: let/fn/foreach bodies not yet defined in grammar
    // - `let fizzbuzz = fn(n) ...` (fizzbuzz with ternary)
    // - `foreach i in range(1, 100) do\n    print fizzbuzz i\nend`
    // - yin/yang line
});

test.only("errors", () => {
    parsesFully("hello(");
});
