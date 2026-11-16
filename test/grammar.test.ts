import { CSTNode, describeCombinator, parseToCST } from "@r47onfire/nebula";
import { condenseCST } from "@r47onfire/nebula/compile";
import { describe, expect, test } from "bun:test";
import { backolonGrammar, objectEntries } from "../src";

type ASTNode = string | number | undefined | ASTNode[];
const toAST = (cst: CSTNode<any>): ASTNode => {
    const recur = (cst: CSTNode<any>): ASTNode => {
        if (cst.errorExpected) return [cst.type, describeCombinator(cst.errorExpected), cst.span.end, cst.text];
        if (cst.type) return [cst.type, ...cst.children!.map(recur)];
        return cst.text ?? undefined;
    };
    return recur(condenseCST(cst));
};

const parse = (text: string): CSTNode<any> => {
    const cst = parseToCST(text, new URL("test:"), 0, "toplevel_exprs", backolonGrammar, "exprs");
    // console.log(text + "\n" + JSON.stringify(toAST(cst)));
    return cst;
};

/** Concatenating the leaves must exactly reproduce the source span */
const leaves = (node: CSTNode<any>): string[] => {
    if (node.children === undefined || node.children.length === 0) return [node.text ?? ""];
    return node.children.flatMap(leaves);
};
const checkSource = (node: CSTNode<any>, source: string): void => {
    expect(leaves(node).join("")).toBe(source.slice(node.span.begin, node.span.end));
};

const parsesFully = (text: string): CSTNode<any> => {
    const cst = parse(text);
    expect(cst.span.end).toBe(text.length);
    checkSource(cst, text);
    return cst;
};

/** Every error node (type "BAD", i.e. has errorExpected) under node, in document order */
const errorNodes = (node: CSTNode<any>): CSTNode<any>[] => [...(node.errorExpected !== undefined ? [node] : []), ...(node.children ?? []).flatMap(errorNodes)];

const TESTS: Record<string, [string, ASTNode | "BAD"][]> = {
    comments: ["## line comment", "##line comment2", "##[[ block comment ##]]", "##[[block comment2##]]", "##[[nested ##[[block comment##]]##]]"].map((x) => [x, ["exprs"]]),

    numbers: (
        [
            ["123", "dec", "123"],
            ["3.14", "dec", "3.14"],
            [".5", "dec", ".5"],
            ["0x1F", "hex", "1F"],
            ["0xc0ffee", "hex", "c0ffee"], // cSpell: ignore ffee
            ["1.e+4", "dec", "1.e+4"],
        ] as const
    ).map(([s, t, r]) => [s, ["exprs", ["number", [t, r]]]]),

    names: ["foo", "_", "foo123", "_bar", "fn", "𓆏"].map((s) => [s, ["exprs", ["name", s]]]),

    strings: [
        [`"hello"`, ["exprs", ["i_string", ["i_body", "hello"]]]],
        [`'hello'`, ["exprs", ["r_string", ["r_body", "hello"]]]],
        [`"fizzbuzz: \\(n) mississippi"`, ["exprs", ["i_string", ["i_body", "fizzbuzz: "], ["i_interpolation", ["exprs", ["name", "n"]]], ["i_body", " mississippi"]]]],
        [`"fizzbuzz: \\(\n    print 1\n    1 + 2\n) mississippi"`, ["exprs", ["i_string", ["i_body", "fizzbuzz: "], ["i_interpolation", ["exprs", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]]]], ["add", ["number", ["dec", "1"]], ["number", ["dec", "2"]]]]], ["i_body", " mississippi"]]]],
        [`"a\\"b"`, ["exprs", ["i_string", ["i_body", "a"], ["i_known_escape", '"'], ["i_body", "b"]]]],
        [`'it\\'s'`, ["exprs", ["r_string", ["r_body", "it"], ["r_escape", "\\'"], ["r_body", "s"]]]],
    ],

    "comments + separators": [
        [`## hello\nprint 1`, ["exprs", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]]]]]],
        [`print 1; print 2`, ["exprs", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]]]], ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "2"]]]]]],
        [`print 1\nprint 2`, ["exprs", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]]]], ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "2"]]]]]],
        [`print 1;;;;;;;;;print 2`, ["exprs", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]]]], ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "2"]]]]]],
        [`;print 1;`, ["exprs", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]]]]]],
        [`print 1 ## trailing\nprint 2`, ["exprs", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]]]], ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "2"]]]]]],
        [`##[[\nprint 1\n##]]`, ["exprs"]],
        [`###[[\nprint 1\n##]]`, ["exprs", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]]]]]],
        [`##[[\nprint 1\n##]]\nprint 1\n##[[\nprint 1\n##]]`, ["exprs", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]]]]]],
    ],

    "precedence/associativity": [
        // 1 + 2 * 3 : the sum's right operand is a term (2 * 3)
        [`1 + 2 * 3`, ["exprs", ["add", ["number", ["dec", "1"]], ["mul", ["number", ["dec", "2"]], ["number", ["dec", "3"]]]]]], // (1 + 2) * 3 : the term's left operand is a par_exp
        [`(1 + 2) * 3`, ["exprs", ["mul", ["par_exp", ["exprs", ["add", ["number", ["dec", "1"]], ["number", ["dec", "2"]]]]], ["number", ["dec", "3"]]]]], // left assoc: 1 + 2 + 3 nests the sum on the left
        [`1 + 2 + 3`, ["exprs", ["add", ["add", ["number", ["dec", "1"]], ["number", ["dec", "2"]]], ["number", ["dec", "3"]]]]], // right assoc pow: 2 ** 3 ** 2 nests factor on the right
        [`2 ** 3 ** 2`, ["exprs", ["pow", ["number", ["dec", "2"]], ["pow", ["number", ["dec", "3"]], ["number", ["dec", "2"]]]]]], // -2 ** 2 is -(2 ** 2): prefix outside the factor
        [`-2 ** 2`, ["exprs", ["func_prefix", ["negate"], ["pow", ["number", ["dec", "2"]], ["number", ["dec", "2"]]]]]], // a * -b : term takes a prefix operand
        [`a * -b`, ["exprs", ["mul", ["name", "a"], ["func_prefix", ["negate"], ["name", "b"]]]]], // -0.8-8 : (-0.8) - 8
        [`-0.8-8`, ["exprs", ["sub", ["func_prefix", ["negate"], ["number", ["dec", "0.8"]]], ["number", ["dec", "8"]]]]], // Right associative: a = (b <- 1)
        [`a = b <- 1`, ["exprs", ["normal_assign", ["name", "a"], ["old_assign", ["name", "b"], ["number", ["dec", "1"]]]]]],
        [`x -> y -> z`, ["exprs", ["arrow", ["arrow", ["name", "x"], ["name", "y"]], ["name", "z"]]]], // Augmented assignment
        [`a += b /= c`, ["exprs", ["add_assign", ["name", "a"], ["div_assign", ["name", "b"], ["name", "c"]]]]], // Implicit calling
        // [`a + b 1 + c`, ["exprs", ["add", ["name", "a"], ["call", ["name", "b"], ["implicit_args", ["add", ["number", ["dec", "1"]], ["name", "c"]]]]]]],],calls: [[`print(1, 2)`,["exprs",["call",["name", "print"],["explicit_args",["number", ["dec", "1"]],["number", ["dec", "2"]],],],],],[`print (1, 2)`,["exprs",["call",["name", "print"],["explicit_args",["number", ["dec", "1"]],["number", ["dec", "2"]],],],],],[`print 1, 2`,["exprs",["call",["name", "print"],["implicit_args",["number", ["dec", "1"]],["number", ["dec", "2"]],],],],],// juxtaposition is right-nested: 'print print 1, 2' parses as 'print(print(1, 2))'
        [`print print 1, 2`, ["exprs", ["call", ["name", "print"], ["implicit_args", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]], ["number", ["dec", "2"]]]]]]]], // a cascade in an implicit argument binds to the argument (as in
        // f(a..b)), not to the whole call; a pipe stays outside it
        [`f a..b`, ["exprs", ["call", ["name", "f"], ["implicit_args", ["up_dot", ["name", "a"], ["name", "b"]]]]]], // zero args
        [`print()`, ["exprs", ["call", ["name", "print"], ["explicit_args"]]]], // (1,,2) has an empty middle arg (null)
        [`print(1,,2)`, ["exprs", ["call", ["name", "print"], ["explicit_args", ["number", ["dec", "1"]], ["empty_arg", undefined], ["number", ["dec", "2"]]]]]],
        [`print 1,,2`, ["exprs", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]], ["empty_arg", undefined], ["number", ["dec", "2"]]]]]], // chained calls: f(x)(y)
        [`print(1)(2)`, ["exprs", ["call", ["call", ["name", "print"], ["explicit_args", ["number", ["dec", "1"]]]], ["explicit_args", ["number", ["dec", "2"]]]]]], // bare name is NOT a call
        [`print`, ["exprs", ["name", "print"]]], // i'm not sure what this actually is supposed to do
        ["print(1, 2), 3", "BAD"],
    ],

    "unary operators": [
        [`-x`, ["exprs", ["func_prefix", ["negate"], ["name", "x"]]]],
        [`!ok`, ["exprs", ["func_prefix", ["not"], ["name", "ok"]]]],
        [`#x`, ["exprs", ["func_prefix", ["length"], ["name", "x"]]]],
        [`#"str"`, ["exprs", ["func_prefix", ["length"], ["i_string", ["i_body", "str"]]]]], //  ...args (splat)
        [`...args`, ["exprs", ["func_prefix", ["splat"], ["name", "args"]]]], //  != is a comparison, not ! followed by =
        [`a != b`, ["exprs", ["comparison", ["name", "a"], ["not_equal"], ["name", "b"]]]], // the key-like prefixes take a member operand: :a.b is (sym a).b - technically makes no sense, but it parses
        [`:a.b`, ["exprs", ["dot", ["member_prefix", ["sym"], ["name", "a"]], ["name", "b"]]]],
        [`:'b'`, "BAD"],
    ],

    indexing: [
        // a.b.c is left-nested: (a.b).c
        [`a.b.c`, ["exprs", ["dot", ["dot", ["name", "a"], ["name", "b"]], ["name", "c"]]]], // test it works with assignment
        [`a.b.c = d.e.f`, ["exprs", ["normal_assign", ["dot", ["dot", ["name", "a"], ["name", "b"]], ["name", "c"]], ["dot", ["dot", ["name", "d"], ["name", "e"]], ["name", "f"]]]]],
        [`a?.b.c = d.e?.f`, ["exprs", ["normal_assign", ["dot", ["null_dot", ["name", "a"], ["name", "b"]], ["name", "c"]], ["null_dot", ["dot", ["name", "d"], ["name", "e"]], ["name", "f"]]]]], // after a dot, only a member: a name, a number, or a par_exp
        [`a.5`, ["exprs", ["dot", ["name", "a"], ["number", ["dec", "5"]]]]],
        [`a.(k)`, ["exprs", ["dot", ["name", "a"], ["par_exp", ["exprs", ["name", "k"]]]]]], // indexing binds TIGHTER than referencing!
        [`&x.y`, ["exprs", ["func_prefix", ["ref"], ["dot", ["name", "x"], ["name", "y"]]]]],
        [`(*x).y`, ["exprs", ["dot", ["par_exp", ["exprs", ["func_prefix", ["deref"], ["name", "x"]]]], ["name", "y"]]]], // a string or a collection is not a member
        [`a.'b'`, "BAD"],
        [`a.[1]`, "BAD"], // a dangling dot: an error node for ".", a silent stop for "?."
        [`a.`, "BAD"],
        [`a?.`, "BAD"],
    ],

    cascade: [
        // right-nested: a..(b..c), so the compiler mirrors the tree --
        // each link's right child is the rest of the chain
        [`a..b..c`, ["exprs", ["up_dot", ["name", "a"], ["up_dot", ["name", "b"], ["name", "c"]]]]], // the receiver is everything before the first .., calls included
        [`a.b()..c()`, ["exprs", ["up_dot", ["call", ["dot", ["name", "a"], ["name", "b"]], ["explicit_args"]], ["call", ["name", "c"], ["explicit_args"]]]]], // a section head may be computed: dynamic dispatch on a ternary-chosen name
        [`x..(foo ? 'a' : 'b')(45)`, ["exprs", ["up_dot", ["name", "x"], ["call", ["par_exp", ["exprs", ["ternary", ["name", "foo"], ["r_string", ["r_body", "a"]], ["r_string", ["r_body", "b"]]]]], ["explicit_args", ["number", ["dec", "45"]]]]]]], // cascades are values: assignment rhs, not assignment targets
        [`x = a..b`, ["exprs", ["normal_assign", ["name", "x"], ["up_dot", ["name", "a"], ["name", "b"]]]]], // a cascade's value is always its left side, so the receiver being guarded never changes after the first link, which makes ?.. after the first link pointless, but we still support it anyway because that makes things easier to parse
        [`a?..b..c`, ["exprs", ["up_dot_null", ["name", "a"], ["up_dot", ["name", "b"], ["name", "c"]]]]],
        [`a..b?..c`, ["exprs", ["up_dot", ["name", "a"], ["up_dot_null", ["name", "b"], ["name", "c"]]]]], // a section may be a numeric index, like a member after a dot
        [`a..5`, ["exprs", ["up_dot", ["name", "a"], ["number", ["dec", "5"]]]]], // an assignment section's value may not itself be a cascade:
        // the ..d is a second section, not part of the assigned value
        [`a..b = c..d`, ["exprs", ["up_dot", ["name", "a"], ["up_dot", ["normal_assign", ["name", "b"], ["name", "c"]], ["name", "d"]]]]], // a multi-line cascade on an implicit call result, with an
        // assignment section per line
        [`return makeFoo()\n  ..bar = 1\n  ..baz = 2`, ["exprs", ["call", ["name", "return"], ["implicit_args", ["up_dot", ["call", ["name", "makeFoo"], ["explicit_args"]], ["up_dot", ["normal_assign", ["name", "bar"], ["number", ["dec", "1"]]], ["normal_assign", ["name", "baz"], ["number", ["dec", "2"]]]]]]]]], // parenthesis always reset ambients
        [`return foo()..(x()..y = 2) = 1`, ["exprs", ["call", ["name", "return"], ["implicit_args", ["up_dot", ["call", ["name", "foo"], ["explicit_args"]], ["normal_assign", ["par_exp", ["exprs", ["up_dot", ["call", ["name", "x"], ["explicit_args"]], ["normal_assign", ["name", "y"], ["number", ["dec", "2"]]]]]], ["number", ["dec", "1"]]]]]]]], // a cascade operator with no section after it: the parse
        // stops at the receiver and drops the operator
        [`a..`, "BAD"],
        [`a?..`, "BAD"],
        [`a..b..`, "BAD"],
    ],

    is: [
        // x is P is a flipped call, P(x): the predicate is just a
        // postfix, so nothing else can be swallowed into it
        [`x is callable`, ["exprs", ["normal_predicate", ["name", "x"], ["name", "callable"]]]],
        [`x is a.b`, ["exprs", ["normal_predicate", ["name", "x"], ["dot", ["name", "a"], ["name", "b"]]]]], // the left side absorbs everything down to a sum
        [`n + 1 is even`, ["exprs", ["normal_predicate", ["add", ["name", "n"], ["number", ["dec", "1"]]], ["name", "even"]]]], // but a comparison stays outside it
        [`x is callable == true`, ["exprs", ["comparison", ["normal_predicate", ["name", "x"], ["name", "callable"]], ["equal"], ["boolean", ["boolean_true"]]]]], // left associative: x is f is g is g(f(x))
        [`x is f is g`, ["exprs", ["normal_predicate", ["normal_predicate", ["name", "x"], ["name", "f"]], ["name", "g"]]]], // return is just a name, so this is return(x)
        [`x is return`, ["exprs", ["normal_predicate", ["name", "x"], ["name", "return"]]]],
    ],

    pipes: [
        // pipes are left-associative
        [`a |> b it |> c it`, ["exprs", ["normal_pipe", ["normal_pipe", ["name", "a"], ["call", ["name", "b"], ["implicit_args", ["name", "it"]]]], ["call", ["name", "c"], ["implicit_args", ["name", "it"]]]]]],
        [`["hello", "world", "!"] |?> it != "!" |*> upper it`, ["exprs", ["map_pipe", ["filter_pipe", ["collection", ["i_string", ["i_body", "hello"]], ["i_string", ["i_body", "world"]], ["i_string", ["i_body", "!"]]], ["comparison", ["name", "it"], ["not_equal"], ["i_string", ["i_body", "!"]]]], ["call", ["name", "upper"], ["implicit_args", ["name", "it"]]]]]],
    ],

    ternary: [
        [`a ? b : c`, ["exprs", ["ternary", ["name", "a"], ["name", "b"], ["name", "c"]]]],
        [`n % 15 == 0 ? "fizzbuzz" : n % 5 == 0 ? "buzz" : "\\(n)"`, ["exprs", ["ternary", ["comparison", ["mod", ["name", "n"], ["number", ["dec", "15"]]], ["equal"], ["number", ["dec", "0"]]], ["i_string", ["i_body", "fizzbuzz"]], ["ternary", ["comparison", ["mod", ["name", "n"], ["number", ["dec", "5"]]], ["equal"], ["number", ["dec", "0"]]], ["i_string", ["i_body", "buzz"]], ["i_string", ["i_interpolation", ["exprs", ["name", "n"]]]]]]]],
    ],

    let: [
        [`let a = b`, ["exprs", ["let", ["simple_let", ["let_bindings", ["normal_assign", ["name", "a"], ["name", "b"]]]]]]],
        [`let a = b c`, ["exprs", ["let", ["simple_let", ["let_bindings", ["normal_assign", ["name", "a"], ["call", ["name", "b"], ["implicit_args", ["name", "c"]]]]]]]]],
        [`let x = a, y = b in foo x end`, ["exprs", ["let", ["let_block", ["let_bindings", ["normal_assign", ["name", "x"], ["name", "a"]], ["normal_assign", ["name", "y"], ["name", "b"]]], ["body_exprs", ["call", ["name", "foo"], ["implicit_args", ["name", "x"]]]]]]]],
        [`let x = a, y = b in foo x end a b`, ["exprs", ["let", ["let_block", ["let_bindings", ["normal_assign", ["name", "x"], ["name", "a"]], ["normal_assign", ["name", "y"], ["name", "b"]]], ["body_exprs", ["call", ["name", "foo"], ["implicit_args", ["name", "x"]]]]]], ["call", ["name", "a"], ["implicit_args", ["name", "b"]]]]],
        [`let(loop) x = a in foo loop end`, ["exprs", ["let", ["let_loop_block", ["name", "loop"], ["let_block", ["let_bindings", ["normal_assign", ["name", "x"], ["name", "a"]]], ["body_exprs", ["call", ["name", "foo"], ["implicit_args", ["name", "loop"]]]]]]]]],
        [`let(loop) x = a in\n    foo loop\nend`, ["exprs", ["let", ["let_loop_block", ["name", "loop"], ["let_block", ["let_bindings", ["normal_assign", ["name", "x"], ["name", "a"]]], ["body_exprs", ["exprs", ["call", ["name", "foo"], ["implicit_args", ["name", "loop"]]]]]]]]]],
        [`let(loop) x = a in ## comment\n    foo loop\nend`, ["exprs", ["let", ["let_loop_block", ["name", "loop"], ["let_block", ["let_bindings", ["normal_assign", ["name", "x"], ["name", "a"]]], ["body_exprs", ["exprs", ["call", ["name", "foo"], ["implicit_args", ["name", "loop"]]]]]]]]]],
        [`let(loop) ##[[ inner comment ##]] x = a in ## comment\n    foo loop\nend`, ["exprs", ["let", ["let_loop_block", ["name", "loop"], ["let_block", ["let_bindings", ["normal_assign", ["name", "x"], ["name", "a"]]], ["body_exprs", ["exprs", ["call", ["name", "foo"], ["implicit_args", ["name", "loop"]]]]]]]]]],
        [`(let x = a in\n    foo loop)`, ["exprs", ["par_exp", ["exprs", ["let", ["let_block", ["let_bindings", ["normal_assign", ["name", "x"], ["name", "a"]]], ["body_exprs", ["exprs", ["call", ["name", "foo"], ["implicit_args", ["name", "loop"]]]]]]]]]]],
        [`let x = a, y = b in x y\nfoo a`, ["exprs", ["let", ["let_block", ["let_bindings", ["normal_assign", ["name", "x"], ["name", "a"]], ["normal_assign", ["name", "y"], ["name", "b"]]], ["body_exprs", ["call", ["name", "x"], ["implicit_args", ["name", "y"]]]]]], ["call", ["name", "foo"], ["implicit_args", ["name", "a"]]]]], // a binding target must be a bare name: the par_exp binding
        // cannot even start, and the recovery consumes the header tail
        [`let x = z, (y) = x in y end`, "BAD"], // only = can bind: += leaves an error node, -> stops the parse
        [`let x += 3 in x end`, "BAD"],
        [`let x -> 3 in x end`, "BAD"], // a doubled comma is an error, not an empty binding
        [`let x = 1,, y = 2 in y end`, "BAD"], // a trailing comma is silently dropped: the parse stops
        // before it instead of consuming the input
        [`let x = 1,`, "BAD"],
    ],

    if: [
        [`if a == b then c() end`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal"], ["name", "b"]], ["if_no_else", ["body_exprs", ["call", ["name", "c"], ["explicit_args"]]]]]]],
        [`if a == b then\n    c()\nend`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal"], ["name", "b"]], ["if_no_else", ["body_exprs", ["exprs", ["call", ["name", "c"], ["explicit_args"]]]]]]]],
        [`if a == b\n    c()\nend`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal"], ["name", "b"]], ["if_no_else", ["body_exprs", ["exprs", ["call", ["name", "c"], ["explicit_args"]]]]]]]],
        [`if a == b then c() else d() end`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal"], ["name", "b"]], ["if_else", ["body_exprs", ["call", ["name", "c"], ["explicit_args"]]], ["body_exprs", ["call", ["name", "d"], ["explicit_args"]]]]]]],
        [`if a == b then\n    c()\nelse\n    d()\nend`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal"], ["name", "b"]], ["if_else", ["body_exprs", ["exprs", ["call", ["name", "c"], ["explicit_args"]]]], ["body_exprs", ["exprs", ["call", ["name", "d"], ["explicit_args"]]]]]]]],
        [`if a == b\n    c()\nelse\n    d()\nend`, ["exprs", ["if", ["comparison", ["name", "a"], ["equal"], ["name", "b"]], ["if_else", ["body_exprs", ["exprs", ["call", ["name", "c"], ["explicit_args"]]]], ["body_exprs", ["exprs", ["call", ["name", "d"], ["explicit_args"]]]]]]]],
    ],

    while: [
        [`while a == b do c() end`, ["exprs", ["while", ["comparison", ["name", "a"], ["equal"], ["name", "b"]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["call", ["name", "c"], ["explicit_args"]]]]]]]]],
        [`while a == b\n    c()\nend`, ["exprs", ["while", ["comparison", ["name", "a"], ["equal"], ["name", "b"]], ["body_exprs", ["exprs", ["call", ["name", "c"], ["explicit_args"]]]]]]],
    ],

    trycatch: [
        [`try x() catch e = ENOENT do b(e) end catch e = EPERM do c(e) end`, ["exprs", ["trycatch", ["body_exprs", ["exprs", ["call", ["name", "x"], ["explicit_args"]]]], ["trycatch_handler", ["normal_assign", ["name", "e"], ["name", "ENOENT"]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["call", ["name", "b"], ["explicit_args", ["name", "e"]]]]]]]], ["trycatch_handler", ["normal_assign", ["name", "e"], ["name", "EPERM"]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["call", ["name", "c"], ["explicit_args", ["name", "e"]]]]]]]], undefined, undefined]]],
        [`try x() catch e = ENOENT do b(e) end catch e = EPERM do c(e) end else foo() finally bar() end`, ["exprs", ["trycatch", ["body_exprs", ["exprs", ["call", ["name", "x"], ["explicit_args"]]]], ["trycatch_handler", ["normal_assign", ["name", "e"], ["name", "ENOENT"]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["call", ["name", "b"], ["explicit_args", ["name", "e"]]]]]]]], ["trycatch_handler", ["normal_assign", ["name", "e"], ["name", "EPERM"]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["call", ["name", "c"], ["explicit_args", ["name", "e"]]]]]]]], ["trycatch_else", ["body_exprs", ["call", ["name", "foo"], ["explicit_args"]]]], ["trycatch_finally", ["body_exprs", ["call", ["name", "bar"], ["explicit_args"]]]]]]],
        [`try\n    x()\ncatch e = ENOENT\n    b(e)\nelse\n    foo()\nfinally\n    bar()\nend`, ["exprs", ["trycatch", ["body_exprs", ["exprs", ["call", ["name", "x"], ["explicit_args"]]]], ["trycatch_handler", ["normal_assign", ["name", "e"], ["name", "ENOENT"]], ["body_exprs", ["exprs", ["call", ["name", "b"], ["explicit_args", ["name", "e"]]]]]], ["trycatch_else", ["body_exprs", ["exprs", ["call", ["name", "foo"], ["explicit_args"]]]]], ["trycatch_finally", ["body_exprs", ["exprs", ["call", ["name", "bar"], ["explicit_args"]]]]]]]],
    ],

    for: [
        [`for i = range 1, 100 do print fizzbuzz i end`, ["exprs", ["for", ["normal_assign", ["name", "i"], ["call", ["name", "range"], ["implicit_args", ["number", ["dec", "1"]], ["number", ["dec", "100"]]]]], ["body_exprs", ["do", ["body_exprs", ["exprs", ["call", ["name", "print"], ["implicit_args", ["call", ["name", "fizzbuzz"], ["implicit_args", ["name", "i"]]]]]]]]]]]],
        [`for i = range 1, 100\n    print fizzbuzz i\nend`, ["exprs", ["for", ["normal_assign", ["name", "i"], ["call", ["name", "range"], ["implicit_args", ["number", ["dec", "1"]], ["number", ["dec", "100"]]]]], ["body_exprs", ["exprs", ["call", ["name", "print"], ["implicit_args", ["call", ["name", "fizzbuzz"], ["implicit_args", ["name", "i"]]]]]]]]]],
    ],

    fn: [
        [`fn(x) x + 1`, ["exprs", ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["add", ["name", "x"], ["number", ["dec", "1"]]]]]]],
        [`fn (x) x + 1`, ["exprs", ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["add", ["name", "x"], ["number", ["dec", "1"]]]]]]],
        [`fn(x)\n    x + 1\nend`, ["exprs", ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["exprs", ["add", ["name", "x"], ["number", ["dec", "1"]]]]]]]],
        [`fn(x, y, ...z) x`, ["exprs", ["fn", ["explicit_args", ["name", "x"], ["name", "y"], ["func_prefix", ["splat"], ["name", "z"]]], ["body_exprs", ["name", "x"]]]]],
        [`fn(x) callcc fn(c) c`, ["exprs", ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["call", ["name", "callcc"], ["implicit_args", ["fn", ["explicit_args", ["name", "c"]], ["body_exprs", ["name", "c"]]]]]]]]],
        [`fn(x) x;\nfn(x) x`, ["exprs", ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["name", "x"]]], ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["name", "x"]]]]],
        [`fn(x) x\nfn(x) x`, ["exprs", ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["name", "x"]]], ["fn", ["explicit_args", ["name", "x"]], ["body_exprs", ["name", "x"]]]]],
    ],

    "lists/maps": [
        [`[1, x, 3]`, ["exprs", ["collection", ["number", ["dec", "1"]], ["name", "x"], ["number", ["dec", "3"]]]]],
        [`[]`, ["exprs", ["collection", ["empty_list"]]]],
        [`[:]`, ["exprs", ["collection", ["empty_map"]]]],
        [`[foo: 1, bar: 2]`, ["exprs", ["collection", ["kw", ["name", "foo"], ["number", ["dec", "1"]]], ["kw", ["name", "bar"], ["number", ["dec", "2"]]]]]], // a kw key must be a member: a number is one, and a computed
        // key goes through a par_exp
        [`[5: 1]`, ["exprs", ["collection", ["kw", ["number", ["dec", "5"]], ["number", ["dec", "1"]]]]]],
        [`[(a.b): 1]`, ["exprs", ["collection", ["kw", ["par_exp", ["exprs", ["dot", ["name", "a"], ["name", "b"]]]], ["number", ["dec", "1"]]]]]], // a prefixed member is a key too: a sym key is a pair, not a
        // call of the sym on a sym of the value
        [`[:x: 1]`, ["exprs", ["collection", ["kw", ["member_prefix", ["sym"], ["name", "x"]], ["number", ["dec", "1"]]]]]],
        [`[:x: 1, :y: 2]`, ["exprs", ["collection", ["kw", ["member_prefix", ["sym"], ["name", "x"]], ["number", ["dec", "1"]]], ["kw", ["member_prefix", ["sym"], ["name", "y"]], ["number", ["dec", "2"]]]]]],
        [`[::x: 1]`, ["exprs", ["collection", ["kw", ["member_prefix", ["unique_sym"], ["name", "x"]], ["number", ["dec", "1"]]]]]],
        [`[(:x): 1]`, ["exprs", ["collection", ["kw", ["par_exp", ["exprs", ["member_prefix", ["sym"], ["name", "x"]]]], ["number", ["dec", "1"]]]]]],
        [`[a ? b : c]`, ["exprs", ["collection", ["ternary", ["name", "a"], ["name", "b"], ["name", "c"]]]]],
        [`[\`foo:]`, ["exprs", ["collection", ["collection_shorthand", ["name", "foo"]]]]],
        [`[\`foo:, \`bar: baz]`, ["exprs", ["collection", ["collection_shorthand", ["name", "foo"]], ["kw", ["quote_prefix", ["quote"], ["name", "bar"]], ["name", "baz"]]]]],
    ],

    quotes: [
        ["`(x + y)", ["exprs", ["func_prefix", ["quote"], ["par_exp", ["exprs", ["add", ["name", "x"], ["name", "y"]]]]]]],
        ["`name", ["exprs", ["func_prefix", ["quote"], ["name", "name"]]]],
        ["``(x)", ["exprs", ["func_prefix", ["quote"], ["func_prefix", ["quote"], ["par_exp", ["exprs", ["name", "x"]]]]]]],
        ["{$x}", ["exprs", ["quasiquote", ["exprs", ["func_prefix", ["unquote"], ["name", "x"]]]]]],
    ],

    parens: [
        [`(1 + 2) * 3`, ["exprs", ["mul", ["par_exp", ["exprs", ["add", ["number", ["dec", "1"]], ["number", ["dec", "2"]]]]], ["number", ["dec", "3"]]]]],
        [`(print 1; print 2)`, ["exprs", ["par_exp", ["exprs", ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "1"]]]], ["call", ["name", "print"], ["implicit_args", ["number", ["dec", "2"]]]]]]]],
        [`(a)`, ["exprs", ["par_exp", ["exprs", ["name", "a"]]]]],
        [`()`, ["exprs", ["par_exp", ["exprs"]]]],
        [`(f)(x)`, ["exprs", ["call", ["par_exp", ["exprs", ["name", "f"]]], ["explicit_args", ["name", "x"]]]]],
    ],

    "README examples": [
        [`print "Hello, World!"`, ["exprs", ["call", ["name", "print"], ["implicit_args", ["i_string", ["i_body", "Hello, World!"]]]]]],
        [`["hello", "world", "!"] |?> it != "!" |*> upper it`, ["exprs", ["map_pipe", ["filter_pipe", ["collection", ["i_string", ["i_body", "hello"]], ["i_string", ["i_body", "world"]], ["i_string", ["i_body", "!"]]], ["comparison", ["name", "it"], ["not_equal"], ["i_string", ["i_body", "!"]]]], ["call", ["name", "upper"], ["implicit_args", ["name", "it"]]]]]], // TODO: rest of these
    ],

    // Inside brackets nothing can end an enclosing block, so the guard is
    // reset and soft keywords are usable as ordinary names. These first
    // cases were errors (or truncated parses) with the old global guard.
    "contextual soft keywords": [
        ["(else)", ["exprs", ["par_exp", ["exprs", ["name", "else"]]]]],
        ["(in)", ["exprs", ["par_exp", ["exprs", ["name", "in"]]]]],
        ["(is)", ["exprs", ["par_exp", ["exprs", ["name", "is"]]]]],
        ["(end)", ["exprs", ["par_exp", ["exprs", ["name", "end"]]]]],
        ["(let else = a in else end)", ["exprs", ["par_exp", ["exprs", ["let", ["let_block", ["let_bindings", ["normal_assign", ["name", "else"], ["name", "a"]]], ["body_exprs", ["name", "else"]]]]]]]],
        ["let x = (in) in x end", ["exprs", ["let", ["let_block", ["let_bindings", ["normal_assign", ["name", "x"], ["par_exp", ["exprs", ["name", "in"]]]]], ["body_exprs", ["name", "x"]]]]]],
    ],

    "format operator": [
        [`1 %% 2`, ["exprs", ["format", ["number", ["dec", "1"]], ["number", ["dec", "2"]]]]],
        // format binds at the term level, like the other term operators
        [`1 + 2 %% 3 * 4`, ["exprs", ["add", ["number", ["dec", "1"]], ["mul", ["format", ["number", ["dec", "2"]], ["number", ["dec", "3"]]], ["number", ["dec", "4"]]]]]],
    ],
};

describe.each(objectEntries(TESTS))("%s", (_, list) => {
    test.each(list.map(([s, n]) => [JSON.stringify(s), s, n]))("%s", (_, str, node) => {
        // a "BAD" entry must not parse cleanly: it either stops
        // before the end of the input (silent truncation) or
        // leaves an error node behind (recovery), or both
        if (node === "BAD") {
            const cst = parse(str);
            checkSource(cst, str);
            expect(errorNodes(cst).length > 0 || cst.span.end < str.length).toBe(true);
            return;
        }
        expect(toAST(parsesFully(str))).toEqual(node);
    });
});

describe("error nodes", () => {
    // "@" is the reference operator with a missing operand: one error covering just the "@"
    test("@", () => {
        const text = "@";
        const cst = parse(text);
        expect(cst.span.end).toBe(text.length);
        checkSource(cst, text);
        const errors = errorNodes(cst);
        expect(errors).toHaveLength(1);
        expect([errors[0]!.span.begin, errors[0]!.span.end, errors[0]!.text]).toEqual([0, 1, "@"]);
    });
    // "1 + % 2": "%" can't start a term, but the "2" after it is recovered as a number, and the result should be 1 + 2
    test("%", () => {
        const text = "1 + % 2";
        const cst = parse(text);
        expect(cst.span.end).toBe(text.length);
        checkSource(cst, text);
        const errors = errorNodes(cst);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.span.end).toBeLessThanOrEqual(6); // the error is before the recovered "2"
        const str = JSON.stringify(toAST(cst));
        expect(str).toContain(`"dec","1"`);
        expect(str).toContain(`"dec","2"`);
        expect(str).toContain(`"add"`); // the "1 +" is preserved as an add, not discarded
    });
    // "(+)" is invalid since + needs at least an argument after it
    test("(+)", () => {
        const text = "1 + (+) + 1";
        const cst = parse(text);
        expect(cst.span.end).toBe(text.length);
        checkSource(cst, text);
        const errors = errorNodes(cst);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.text).toBe("+");
        expect([errors[0]!.span.begin, errors[0]!.span.end]).toEqual([5, 6]);
        // add(add(1, BAD), 1): nested sums, error inside the inner one, not toplevel
        const ast = toAST(cst) as ASTNode[];
        expect(ast[0]).toBe("exprs");
        const outer = ast[1] as ASTNode[];
        expect(outer[0]).toBe("add");
        expect((outer[1] as ASTNode[])[0]).toBe("add");
    });

    test("++%++", () => {
        const text = "1 + 1 + % 1 + 1 + 1";
        const cst = parse(text);
        expect(cst.span.end).toBe(text.length);
        checkSource(cst, text);
        const errors = errorNodes(cst);
        expect(errors).toHaveLength(1);
    });
});
