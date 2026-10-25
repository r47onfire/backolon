import { describe, expect, test } from "bun:test";
import { backolonGrammar, CSTNode, describeCombinator, parseToCST } from "../src";

type ASTNode = string | number | undefined | ASTNode[];
const toAST = (cst: CSTNode): ASTNode => {
    const c = () => cst.children?.filter(c => !c.ignored).flatMap(c => c.type ? [toAST(c)] : toAST(c)) ?? [];
    if (cst.errorExpected) return [cst.type, describeCombinator(cst.errorExpected), cst.end, cst.text];
    if (cst.type) return [cst.type, ...c()];
    if (cst.children) return c();
    return cst.text;
}

const parse = (text: string): CSTNode => {
    const cst = parseToCST(text, 0, "toplevel_exprs", backolonGrammar, "exprs");
    // console.log(text + "\n" + JSON.stringify(toAST(cst)));
    return cst;
};

/** concatenating the leaves must exactly reproduce the source span */
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

const TESTS: Record<string, [string, ASTNode][]> = {

    comments: [
        "## line comment",
        "##line comment2",
        "##[[ block comment ##]]",
        "##[[block comment2##]]",
        "##[[nested ##[[block comment##]]##]]",
    ].map(x => [x, ["exprs"]]),

    numbers: ([
        ["123", "decimal"],
        ["3.14", "decimal"],
        [".5", "decimal"],
        ["0x1F", "hex"],
        ["0xc0ffee", "hex"],
        ["1.e+4", "decimal"],
    ] as const).map(([s, t]) => [s, ["exprs", ["number", [t, s]]]]),

    names: [
        "foo",
        "_",
        "foo123",
        "_bar",
        "fn",
    ].map(s => [s, ["exprs", ["name", s]]]),

    strings: [
        [`"hello"`, ["exprs", ["i_string", ["i_body", "hello"]]]],
        [`'hello'`, ["exprs", ["r_string", ["r_body", "hello"]]]],
        [`"fizzbuzz: \\(n) mississippi"`, ["exprs", ["i_string", ["i_body", "fizzbuzz: "], ["i_interpolation", ["exprs", ["name", "n"]]], ["i_body", " mississippi"]]]],
        [`"fizzbuzz: \\(\n    print 1\n    1 + 2\n) mississippi"`, ["exprs", ["i_string", ["i_body", "fizzbuzz: "], ["i_interpolation", ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]]]], ["sum", ["number", ["decimal", "1"]], ["add", "+"], ["number", ["decimal", "2"]]]]], ["i_body", " mississippi"]]]],
        [`"a\\"b"`, ["exprs", ["i_string", ["i_body", "a"], ["i_escape", ["i_known_escape", "\""]], ["i_body", "b"]]]],
        [`'it\\'s'`, ["exprs", ["r_string", ["r_body", "it"], ["r_escape", "\\'"], ["r_body", "s"]]]],
    ],

    "comments + separators": [
        [`## hello\nprint 1`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]]]]]],
        [`print 1; print 2`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]]]], ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "2"]]]]]],
        [`print 1\nprint 2`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]]]], ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "2"]]]]]],
        [`print 1;;;;;;;;;print 2`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]]]], ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "2"]]]]]],
        [`;print 1;`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]]]]]],
        [`print 1 ## trailing\nprint 2`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]]]], ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "2"]]]]]],
        [`##[[\nprint 1\n##]]`, ["exprs"]],
        [`###[[\nprint 1\n##]]`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]]]]]],
        [`##[[\nprint 1\n##]]\nprint 1\n##[[\nprint 1\n##]]`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]]]]]],
    ],

    "precedence/associativity": [
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
        [`a += b /= c`, ["exprs", ["assignment", ["name", "a"], ["aug_assign", ["add", "+"]], ["assignment", ["name", "b"], ["aug_assign", ["div", "/"]], ["name", "c"]]]]],
    ],

    calls: [
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
        // TODO: i'm not sure what this actually is supposed to do
        // ["print(1, 2), 3", []],
    ],

    "unary operators": [
        [`-x`, ["exprs", ["prefix", ["negate", "-"], ["name", "x"]]]],
        [`!ok`, ["exprs", ["prefix", ["not", "!"], ["name", "ok"]]]],
        [`#x`, ["exprs", ["prefix", ["length", "#"], ["name", "x"]]]],
        [`#"str"`, ["exprs", ["prefix", ["length", "#"], ["i_string", ["i_body", "str"]]]]],
        //  ...args (splat)
        [`...args`, ["exprs", ["prefix", ["spread", "..."], ["name", "args"]]]],
        //  != is a comparison, not ! followed by =
        [`a != b`, ["exprs", ["comparison", ["name", "a"], ["not_equal", "!="], ["name", "b"]]]],
    ],

    indexing: [
        // a.b.c is left-nested: (a.b).c
        [`a.b.c`, ["exprs", ["indexing", ["indexing", ["name", "a"], ["dot", "."], ["name", "b"]], ["dot", "."], ["name", "c"]]]],
        // test it works with assignment
        [`a.b.c = d.e.f`, ["exprs", ["assignment", ["indexing", ["indexing", ["name", "a"], ["dot", "."], ["name", "b"]], ["dot", "."], ["name", "c"]], ["normal_assign", "="], ["indexing", ["indexing", ["name", "d"], ["dot", "."], ["name", "e"]], ["dot", "."], ["name", "f"]]]]],
        // indexing binds TIGHTER than referencing!
        [`&x.y`, ["exprs", ["prefix", ["ref", "&"], ["indexing", ["name", "x"], ["dot", "."], ["name", "y"]]]]],
        [`&x->y`, ["exprs", ["prefix", ["ref", "&"], ["indexing", ["name", "x"], ["arrow", "->"], ["name", "y"]]]]],
        [`(*x).y`, ["exprs", ["indexing", ["par_exp", ["exprs", ["prefix", ["deref", "*"], ["name", "x"]]]], ["dot", "."], ["name", "y"]]]],
    ],

    pipes: [
        // pipes are left-associative
        [`a |> b it |> c it`, ["exprs", ["pipe", ["pipe", ["name", "a"], ["normal_pipe", "|>"], ["implicit_call", ["name", "b"], ["implicit_args", ["name", "it"]]]], ["normal_pipe", "|>"], ["implicit_call", ["name", "c"], ["implicit_args", ["name", "it"]]]]]],
        [`["hello", "world", "!"] |?> it != "!" |*> upper it`, ["exprs", ["pipe", ["pipe", ["collection", ["collection_body", ["i_string", ["i_body", "hello"]], ["i_string", ["i_body", "world"]], ["i_string", ["i_body", "!"]]]], ["filter_pipe", "|?>"], ["comparison", ["name", "it"], ["not_equal", "!="], ["i_string", ["i_body", "!"]]]], ["map_pipe", "|*>"], ["implicit_call", ["name", "upper"], ["implicit_args", ["name", "it"]]]]]],
    ],

    ternary: [
        [`a ? b : c`, ["exprs", ["ternary", ["name", "a"], ["name", "b"], ["name", "c"]]]],
        [`n % 15 == 0 ? "fizzbuzz" : n % 5 == 0 ? "buzz" : "\\(n)"`, ["exprs", ["ternary", ["comparison", ["term", ["name", "n"], ["mod", "%"], ["number", ["decimal", "15"]]], ["equal", "=="], ["number", ["decimal", "0"]]], ["i_string", ["i_body", "fizzbuzz"]], ["ternary", ["comparison", ["term", ["name", "n"], ["mod", "%"], ["number", ["decimal", "5"]]], ["equal", "=="], ["number", ["decimal", "0"]]], ["i_string", ["i_body", "buzz"]], ["i_string", ["i_interpolation", ["exprs", ["name", "n"]]]]]]]]
    ],

    let: [
        [`let a = b`, ["exprs", ["let", ["simple_let", ["implicit_args", ["assignment", ["name", "a"], ["normal_assign", "="], ["name", "b"]]]]]]],
        [`let a = b c`, ["exprs", ["let", ["simple_let", ["implicit_args", ["assignment", ["name", "a"], ["normal_assign", "="], ["implicit_call", ["name", "b"], ["implicit_args", ["name", "c"]]]]]]]]],
        [`let x = a, y = b in foo x end`, ["exprs", ["let", ["let_block", ["implicit_args", ["assignment", ["name", "x"], ["normal_assign", "="], ["name", "a"]], ["assignment", ["name", "y"], ["normal_assign", "="], ["name", "b"]]], ["body_exprs", ["implicit_call", ["name", "foo"], ["implicit_args", ["name", "x"]]]]]]]],
        [`let x = a, y = b in foo x end a b`, ["exprs", ["let", ["let_block", ["implicit_args", ["assignment", ["name", "x"], ["normal_assign", "="], ["name", "a"]], ["assignment", ["name", "y"], ["normal_assign", "="], ["name", "b"]]], ["body_exprs", ["implicit_call", ["name", "foo"], ["implicit_args", ["name", "x"]]]]]], ["implicit_call", ["name", "a"], ["implicit_args", ["name", "b"]]]]],
        [`let(loop) x = a in foo loop end`, ["exprs", ["let", ["let_loop_block", ["name", "loop"], ["let_block", ["implicit_args", ["assignment", ["name", "x"], ["normal_assign", "="], ["name", "a"]]], ["body_exprs", ["implicit_call", ["name", "foo"], ["implicit_args", ["name", "loop"]]]]]]]]],
        [`let(loop) x = a in\n    foo loop\nend`, ["exprs", ["let", ["let_loop_block", ["name", "loop"], ["let_block", ["implicit_args", ["assignment", ["name", "x"], ["normal_assign", "="], ["name", "a"]]], ["body_exprs", ["exprs", ["implicit_call", ["name", "foo"], ["implicit_args", ["name", "loop"]]]]]]]]]],
        [`let(loop) x = a in ## comment\n    foo loop\nend`, ["exprs", ["let", ["let_loop_block", ["name", "loop"], ["let_block", ["implicit_args", ["assignment", ["name", "x"], ["normal_assign", "="], ["name", "a"]]], ["body_exprs", ["exprs", ["implicit_call", ["name", "foo"], ["implicit_args", ["name", "loop"]]]]]]]]]],
        [`let(loop) ##[[ inner comment ##]] x = a in ## comment\n    foo loop\nend`, ["exprs", ["let", ["let_loop_block", ["name", "loop"], ["let_block", ["implicit_args", ["assignment", ["name", "x"], ["normal_assign", "="], ["name", "a"]]], ["body_exprs", ["exprs", ["implicit_call", ["name", "foo"], ["implicit_args", ["name", "loop"]]]]]]]]]],
        [`(let x = a in\n    foo loop)`, ["exprs", ["par_exp", ["exprs", ["let", ["let_block", ["implicit_args", ["assignment", ["name", "x"], ["normal_assign", "="], ["name", "a"]]], ["body_exprs", ["exprs", ["implicit_call", ["name", "foo"], ["implicit_args", ["name", "loop"]]]]]]]]]]],
        [`let x = a, y = b in x y\nfoo a`, ["exprs", ["let", ["let_block", ["implicit_args", ["assignment", ["name", "x"], ["normal_assign", "="], ["name", "a"]], ["assignment", ["name", "y"], ["normal_assign", "="], ["name", "b"]]], ["body_exprs", ["implicit_call", ["name", "x"], ["implicit_args", ["name", "y"]]]]]], ["implicit_call", ["name", "foo"], ["implicit_args", ["name", "a"]]]]],
    ],

    if: [
        [`if a == b then c() end`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal", "=="], ["name", "b"]], ["if_no_else", ["body_exprs", ["explicit_call", ["name", "c"], ["explicit_args"]]]]]]],
        [`if a == b then\n    c()\nend`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal", "=="], ["name", "b"]], ["if_no_else", ["body_exprs", ["exprs", ["explicit_call", ["name", "c"], ["explicit_args"]]]]]]]],
        [`if a == b\n    c()\nend`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal", "=="], ["name", "b"]], ["if_no_else", ["body_exprs", ["exprs", ["explicit_call", ["name", "c"], ["explicit_args"]]]]]]]],
        [`if a == b then c() else d() end`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal", "=="], ["name", "b"]], ["if_else", ["body_exprs", ["explicit_call", ["name", "c"], ["explicit_args"]]], ["body_exprs", ["explicit_call", ["name", "d"], ["explicit_args"]]]]]]],
        [`if a == b then\n    c()\nelse\n    d()\nend`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal", "=="], ["name", "b"]], ["if_else", ["body_exprs", ["exprs", ["explicit_call", ["name", "c"], ["explicit_args"]]]], ["body_exprs", ["exprs", ["explicit_call", ["name", "d"], ["explicit_args"]]]]]]]],
        [`if a == b\n    c()\nelse\n    d()\nend`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal", "=="], ["name", "b"]], ["if_else", ["body_exprs", ["exprs", ["explicit_call", ["name", "c"], ["explicit_args"]]]], ["body_exprs", ["exprs", ["explicit_call", ["name", "d"], ["explicit_args"]]]]]]]],
    ],

    while: [
        [`while a == b do c() end`, ["exprs", ["while", ["comparison", ["name", "a"], ["equal", "=="], ["name", "b"]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["explicit_call", ["name", "c"], ["explicit_args"]]]]]]]]],
        [`while a == b\n    c()\nend`, ["exprs", ["while", ["comparison", ["name", "a"], ["equal", "=="], ["name", "b"]], ["body_exprs", ["exprs", ["explicit_call", ["name", "c"], ["explicit_args"]]]]]]],
    ],

    trycatch: [
        [`try x() catch e = ENOENT do b(e) end catch e = EPERM do c(e) end`, ["exprs", ["trycatch", ["body_exprs", ["exprs", ["explicit_call", ["name", "x"], ["explicit_args"]]]], ["trycatch_handler", ["assignment", ["name", "e"], ["normal_assign", "="], ["name", "ENOENT"]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["explicit_call", ["name", "b"], ["explicit_args", ["name", "e"]]]]]]]], ["trycatch_handler", ["assignment", ["name", "e"], ["normal_assign", "="], ["name", "EPERM"]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["explicit_call", ["name", "c"], ["explicit_args", ["name", "e"]]]]]]]], undefined, undefined]]],
        [`try x() catch e = ENOENT do b(e) end catch e = EPERM do c(e) end else foo() finally bar() end`, ["exprs", ["trycatch", ["body_exprs", ["exprs", ["explicit_call", ["name", "x"], ["explicit_args"]]]], ["trycatch_handler", ["assignment", ["name", "e"], ["normal_assign", "="], ["name", "ENOENT"]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["explicit_call", ["name", "b"], ["explicit_args", ["name", "e"]]]]]]]], ["trycatch_handler", ["assignment", ["name", "e"], ["normal_assign", "="], ["name", "EPERM"]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["explicit_call", ["name", "c"], ["explicit_args", ["name", "e"]]]]]]]], ["trycatch_else", ["body_exprs", ["explicit_call", ["name", "foo"], ["explicit_args"]]]], ["trycatch_finally", ["body_exprs", ["explicit_call", ["name", "bar"], ["explicit_args"]]]]]]],
        [`try\n    x()\ncatch e = ENOENT\n    b(e)\nelse\n    foo()\nfinally\n    bar()\nend`, ["exprs", ["trycatch", ["body_exprs", ["exprs", ["explicit_call", ["name", "x"], ["explicit_args"]]]], ["trycatch_handler", ["assignment", ["name", "e"], ["normal_assign", "="], ["name", "ENOENT"]], ["body_exprs", ["exprs", ["explicit_call", ["name", "b"], ["explicit_args", ["name", "e"]]]]]], ["trycatch_else", ["body_exprs", ["exprs", ["explicit_call", ["name", "foo"], ["explicit_args"]]]]], ["trycatch_finally", ["body_exprs", ["exprs", ["explicit_call", ["name", "bar"], ["explicit_args"]]]]]]]],
    ],

    for: [
        [`for i = range 1, 100 do print fizzbuzz i end`, ["exprs", ["for", ["assignment", ["name", "i"], ["normal_assign", "="], ["implicit_call", ["name", "range"], ["implicit_args", ["number", ["decimal", "1"]], ["number", ["decimal", "100"]]]]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["implicit_call", ["name", "fizzbuzz"], ["implicit_args", ["name", "i"]]]]]]]]]]]],
        [`for i = range 1, 100\n    print fizzbuzz i\nend`, ["exprs", ["for", ["assignment", ["name", "i"], ["normal_assign", "="], ["implicit_call", ["name", "range"], ["implicit_args", ["number", ["decimal", "1"]], ["number", ["decimal", "100"]]]]], ["body_exprs", ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["implicit_call", ["name", "fizzbuzz"], ["implicit_args", ["name", "i"]]]]]]]]]],
    ],

    fn: [
        [`fn(x) x + 1`, ["exprs", ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["exprs", ["sum", ["name", "x"], ["add", "+"], ["number", ["decimal", "1"]]]]]]]],
        [`fn (x) x + 1`, ["exprs", ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["exprs", ["sum", ["name", "x"], ["add", "+"], ["number", ["decimal", "1"]]]]]]]],
        [`fn(x)\n    x + 1\nend`, ["exprs", ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["exprs", ["sum", ["name", "x"], ["add", "+"], ["number", ["decimal", "1"]]]]]]]],
        [`fn(x, y, ...z) x`, ["exprs", ["fn", ["explicit_args", ["name", "x"], ["name", "y"], ["prefix", ["spread", "..."], ["name", "z"]]], ["body_exprs", ["exprs", ["name", "x"]]]]]],
        [`fn(x) callcc fn(c) c`, ["exprs", ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["exprs", ["implicit_call", ["name", "callcc"], ["implicit_args", ["fn", ["explicit_args", ["name", "c"]], ["body_exprs", ["exprs", ["name", "c"]]]]]]]]]]],
        [`fn(x) x;\nfn(x) x`, ["exprs", ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["exprs", ["name", "x"]]]], ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["exprs", ["name", "x"]]]]]],
    ],

    "lists/maps": [
        [`[1, x, 3]`, ["exprs", ["collection", ["collection_body", ["number", ["decimal", "1"]], ["name", "x"], ["number", ["decimal", "3"]]]]]],
        [`[]`, ["exprs", ["collection", ["empty_list"]]]],
        [`[:]`, ["exprs", ["collection", ["empty_map"]]]],
        [`[foo: 1, bar: 2]`, ["exprs", ["collection", ["collection_body", ["kw_arg", ["name", "foo"], ["kw", ":"], ["number", ["decimal", "1"]]], ["kw_arg", ["name", "bar"], ["kw", ":"], ["number", ["decimal", "2"]]]]]]],
        [`[a ? b : c]`, ["exprs", ["collection", ["collection_body", ["ternary", ["name", "a"], ["name", "b"], ["name", "c"]]]]]],
        [`[\`foo:]`, ["exprs", ["collection", ["collection_body", ["collection_shorthand", ["name", "foo"]]]]]],
        [`[\`foo:, \`bar: baz]`, ["exprs", ["collection", ["collection_body", ["collection_shorthand", ["name", "foo"]], ["kw_arg", ["prefix", ["quote", "`"], ["name", "bar"]], ["kw", ":"], ["name", "baz"]]]]]],
    ],

    quotes: [
        ["`(x + y)", ["exprs", ["prefix", ["quote", "`"], ["par_exp", ["exprs", ["sum", ["name", "x"], ["add", "+"], ["name", "y"]]]]]]],
        ["`name", ["exprs", ["prefix", ["quote", "`"], ["name", "name"]]]],
        ["``(x)", ["exprs", ["prefix", ["quote", "`"], ["prefix", ["quote", "`"], ["par_exp", ["exprs", ["name", "x"]]]]]]],
        ["{$x}", ["exprs", ["quasiquote", ["exprs", ["prefix", ["unquote", "$"], ["name", "x"]]]]]]
    ],

    parens: [
        [`(1 + 2) * 3`, ["exprs", ["term", ["par_exp", ["exprs", ["sum", ["number", ["decimal", "1"]], ["add", "+"], ["number", ["decimal", "2"]]]]], ["mul", "*"], ["number", ["decimal", "3"]]]]],
        [`(print 1; print 2)`, ["exprs", ["par_exp", ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "1"]]]], ["implicit_call", ["name", "print"], ["implicit_args", ["number", ["decimal", "2"]]]]]]]],
        [`(a)`, ["exprs", ["par_exp", ["exprs", ["name", "a"]]]]],
        [`()`, ["exprs", ["par_exp", ["exprs"]]]],
        [`(f)(x)`, ["exprs", ["explicit_call", ["par_exp", ["exprs", ["name", "f"]]], ["explicit_args", ["name", "x"]]]]],
    ],

    "README examples": [
        [`print "Hello, World!"`, ["exprs", ["implicit_call", ["name", "print"], ["implicit_args", ["i_string", ["i_body", "Hello, World!"]]]]]],
        [`["hello", "world", "!"] |?> it != "!" |*> upper it`, ["exprs", ["pipe", ["pipe", ["collection", ["collection_body", ["i_string", ["i_body", "hello"]], ["i_string", ["i_body", "world"]], ["i_string", ["i_body", "!"]]]], ["filter_pipe", "|?>"], ["comparison", ["name", "it"], ["not_equal", "!="], ["i_string", ["i_body", "!"]]]], ["map_pipe", "|*>"], ["implicit_call", ["name", "upper"], ["implicit_args", ["name", "it"]]]]]],
        // TODO: rest of these
    ],

    // Inside brackets nothing can end an enclosing block, so the guard is
    // reset and soft keywords are usable as ordinary names. These first
    // cases were errors (or truncated parses) with the old global guard.
    "contextual soft keywords": [
        ["(else)", ["exprs", ["par_exp", ["exprs", ["name", "else"]]]]],
        ["(in)", ["exprs", ["par_exp", ["exprs", ["name", "in"]]]]],
        ["(end)", ["exprs", ["par_exp", ["exprs", ["name", "end"]]]]],
        ["(let else = a in else end)", ["exprs", ["par_exp", ["exprs", ["let", ["let_block", ["implicit_args", ["assignment", ["name", "else"], ["normal_assign", "="], ["name", "a"]]], ["body_exprs", ["name", "else"]]]]]]]],
        ["let x = (in) in x end", ["exprs", ["let", ["let_block", ["implicit_args", ["assignment", ["name", "x"], ["normal_assign", "="], ["par_exp", ["exprs", ["name", "in"]]]]], ["body_exprs", ["name", "x"]]]]]],
    ]
};

describe.each(Object.entries(TESTS))("%s", (_, list) => {
    test.each(list.map(([s, n]) => [JSON.stringify(s), s, n]))("%s", (_, str, node) => {
        expect(toAST(parsesFully(str))).toEqual(node);
    });
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
