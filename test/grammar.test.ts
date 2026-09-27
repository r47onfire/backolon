import { expect, test } from "bun:test";
import { backolonGrammar, CSTNode, MatchFail, parseToCST } from "../src";

const parse = (text: string): CSTNode => {
    const cst = parseToCST(text, 0, "program", backolonGrammar);
    expect(cst).not.toBeInstanceOf(MatchFail);
    // console.log(JSON.stringify(cst, null, 2));
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

/** leaves holding only blanks/comments carry no meaning for shape assertions */
const isWsLeaf = (n: CSTNode): boolean =>
    n.text !== undefined &&
    (n.children ?? []).length === 0 &&
    /^[ \t\r\n]*(##[^\n]*)?$/.test(n.text);

/** a zero-width anonymous control node (lookahead result, epsilon) */
const isEmptyControl = (n: CSTNode): boolean =>
    n.text === undefined && n.type === undefined && n.tag === undefined &&
    n.transform === undefined && (n.children ?? []).length === 0;

/** children with whitespace and empty control nodes removed */
const kids = (n: CSTNode): CSTNode[] =>
    (n?.children ?? []).filter((c) => !isWsLeaf(c) && !isEmptyControl(c));

/**
 * The meaningful parts of a rule node. A `rule()` application wraps its
 * body result in exactly one child; when that child is an anonymous
 * sequence/alternatives node, see through it to the actual parts.
 */
const payload = (n: CSTNode): CSTNode[] => {
    const k = kids(n);
    if (k.length === 1) {
        const inner = k[0]!;
        if (inner.type === undefined && inner.text === undefined) return kids(inner);
    }
    return k;
};

const findAll = (n: CSTNode, type: string): CSTNode[] => [
    ...(n.type === type ? [n] : []),
    ...(n.children ?? []).flatMap((c) => findAll(c, type)),
];

/**
 * Nodes of `type` that actually did something. Every `rule()` application
 * wraps its result, so pass-through branches (and left-recursion seeds)
 * leave single-part wrappers; those are filtered out.
 */
const real = (n: CSTNode, type: string): CSTNode[] =>
    findAll(n, type).filter((x) => payload(x).length !== 1);

/** collapse pass-through wrappers (single-payload rules) to the real node */
const core = (n: CSTNode): CSTNode => {
    const p = payload(n);
    return p.length === 1 && p[0] !== n ? core(p[0]!) : n;
};

/** the meaningful leaf texts of a node, in order */
const leafTexts = (n: CSTNode): string[] =>
    (n.children ?? []).length === 0
        ? [n.text ?? ""]
        : (n.children ?? []).flatMap(leafTexts);

const parsesFully = (text: string): CSTNode => {
    const cst = parse(text);
    expect(cst.end).toBe(text.length);
    checkSource(cst, text);
    return cst;
};

test("numbers", () => {
    for (const text of ["123", "3.14", ".5", "0x1F", "0xff"]) {
        const cst = parsesFully(text);
        expect(findAll(cst, "number")).toHaveLength(1);
    }
});

test("names", () => {
    for (const text of ["foo", "_", "foo123", "_bar", "in", "end", "fn"]) {
        const cst = parsesFully(text);
        expect(findAll(cst, "name")).toHaveLength(1);
    }
});

test("strings", () => {
    let cst = parsesFully(`"hello"`);
    expect(findAll(cst, "dstring")).toHaveLength(1);
    cst = parsesFully(`'single'`);
    expect(findAll(cst, "sstring")).toHaveLength(1);
    cst = parsesFully(`"fizzbuzz: {n}"`);
    expect(findAll(cst, "interp")).toHaveLength(1);
    // escapes
    parsesFully(`"a\\"b"`);
    parsesFully(`'it\\'s'`);
});

test("comments and separators", () => {
    let cst = parsesFully(`## hello\nprint 1`);
    expect(real(cst, "call")).toHaveLength(1);
    cst = parsesFully(`print 1; print 2`);
    expect(real(cst, "call")).toHaveLength(2);
    cst = parsesFully(`print 1\nprint 2`);
    expect(real(cst, "call")).toHaveLength(2);
    cst = parsesFully(`print 1;;;;;;;;;print 2`);
    expect(real(cst, "call")).toHaveLength(2);
    cst = parsesFully(`;print 1;`);
    expect(real(cst, "call")).toHaveLength(1);
    cst = parsesFully(`print 1 ## trailing\nprint 2`);
    expect(real(cst, "call")).toHaveLength(2);
});

test("arithmetic precedence and associativity", () => {
    // 1 + 2 * 3 : the add's right operand is a mul
    let cst = parsesFully(`1 + 2 * 3`);
    let adds = real(cst, "add");
    expect(adds).toHaveLength(1);
    expect(payload(adds[0]!)[2]!.type).toBe("mul");

    // (1 + 2) * 3 : the mul's left operand is a parens
    cst = parsesFully(`(1 + 2) * 3`);
    const muls = real(cst, "mul");
    expect(muls).toHaveLength(1);
    expect(core(payload(muls[0]!)[0]!).type).toBe("parens");

    // left assoc: 1 + 2 + 3 nests the add on the left
    cst = parsesFully(`1 + 2 + 3`);
    adds = real(cst, "add");
    expect(adds).toHaveLength(2);
    const outerAdd = adds.find((a) => payload(a)[0]!.type === "add")!;
    expect(outerAdd).toBeDefined();

    // right assoc pow: 2 ** 3 ** 2 nests pow on the right
    cst = parsesFully(`2 ** 3 ** 2`);
    const pows = real(cst, "pow");
    expect(pows).toHaveLength(2);
    const rightOperand = payload(pows.find((p) => payload(p)[2]!.type === "unary")!)[2]!;
    expect(kids(rightOperand)[0]!.type).toBe("pow");

    // -2 ** 2 is -(2 ** 2): unary outside the pow
    cst = parsesFully(`-2 ** 2`);
    const unaries = real(cst, "unary");
    expect(unaries).toHaveLength(1);
    expect(payload(payload(unaries[0]!)[1]!)[0]!.type).toBe("pow");

    // a * -b : mul takes a unary operand
    parsesFully(`a * -b`);
    // -0.8-8
    parsesFully(`-0.8-8`);
});

test("assignment is right associative", () => {
    const cst = parsesFully(`a = b = 1`);
    const assigns = real(cst, "assign");
    expect(assigns).toHaveLength(2);
    const outer = assigns.find((a) => payload(a)[2]!.type === "assign")!;
    expect(outer).toBeDefined();
});

test("calls: explicit, implicit, comma args, empties", () => {
    for (const [text, argCount] of [
        [`print(1, 2)`, 2], [`print (1, 2)`, 2], [`print 1, 2`, 2], [`print(1,2), 3`, 3],
    ] as const) {
        const cst = parsesFully(text);
        expect(real(cst, "call")).toHaveLength(1);
        expect(findAll(cst, "number")).toHaveLength(argCount);
    }
    // juxtaposition is right-nested: print print 1 + 2 * 3, 4
    let cst = parsesFully(`print print 1 + 2 * 3, 4`);
    expect(real(cst, "call")).toHaveLength(2);

    // zero args
    cst = parsesFully(`print()`);
    expect(real(cst, "call")).toHaveLength(1);

    // (,) is one empty arg; (1,,2) has an empty middle
    cst = parsesFully(`print(,)`);
    expect(real(cst, "call")).toHaveLength(1);
    expect(findAll(cst, "number")).toHaveLength(0);
    cst = parsesFully(`print(1,,2)`);
    expect(real(cst, "call")).toHaveLength(1);
    expect(findAll(cst, "number")).toHaveLength(2);

    // chained explicit args: f(x)(y)
    cst = parsesFully(`f(x)(y)`);
    expect(real(cst, "call")).toHaveLength(1);

    // bare name is NOT a call
    cst = parsesFully(`print`);
    const calls = findAll(cst, "call");
    expect(calls).toHaveLength(0);
});

test("unary operators", () => {
    parsesFully(`-x`);
    parsesFully(`!ok`);
    parsesFully(`#x`);
    parsesFully(`#"str"`);
    parsesFully(`...args`);
    // != is a comparison, not ! followed by =
    const cst = parsesFully(`a != b`);
    expect(real(cst, "cmp")).toHaveLength(1);
    expect(real(cst, "unary")).toHaveLength(0);
});

test("indexing is left associative", () => {
    const cst = parsesFully(`x->1->2`);
    const postfixes = real(cst, "postfix");
    expect(postfixes).toHaveLength(2);
    const outer = postfixes.find((p) => payload(p)[0]!.type === "postfix")!;
    expect(outer).toBeDefined();
    parsesFully(`x->1`);
});

test("pipes", () => {
    const cst = parsesFully(`a |> b it |> c it`);
    const pipes = real(cst, "pipe");
    // one pipe node collecting both stages
    expect(pipes).toHaveLength(1);
    expect(leafTexts(pipes[0]!).filter((t) => t === "|>")).toHaveLength(2);
    parsesFully(`["hello", "world", "!"] |?> it != "!" |*> upper it |+> that + it`);
});

test("ternary", () => {
    const cst = parsesFully(`a ? b : c`);
    expect(real(cst, "ternary")).toHaveLength(1);
    // nested, right associative
    parsesFully(`n % 15 == 0 ? "fizzbuzz" : n % 5 == 0 ? "buzz" : "{n}"`);
});

test("let", () => {
    // simple let is an implicit call of `let`
    let cst = parsesFully(`let a = 1`);
    expect(real(cst, "call")).toHaveLength(1);
    expect(findAll(cst, "letBlock")).toHaveLength(0);

    // let/in/end is a block
    cst = parsesFully(`let x = 1, y = 2 in foo x end`);
    expect(real(cst, "letBlock")).toHaveLength(1);
    expect(findAll(cst, "letLoop")).toHaveLength(0);

    // let(loop) form
    cst = parsesFully(`let(loop) x = 1 in foo loop end`);
    expect(real(cst, "letLoop")).toHaveLength(1);

    // multi-line block
    parsesFully(`let x = 1, y = 2 in\n    foo bar\nend`);
});

test("foreach", () => {
    let cst = parsesFully(`foreach i in range(1, 100) do\n    print fizzbuzz i\nend`);
    expect(real(cst, "foreach")).toHaveLength(1);
    cst = parsesFully(`foreach i in x do print i end`);
    expect(real(cst, "foreach")).toHaveLength(1);
});

test("lambdas", () => {
    // inline
    let cst = parsesFully(`fn(x) x + 1`);
    expect(real(cst, "lambda")).toHaveLength(1);
    // block
    cst = parsesFully(`fn(x)\n    x + 1\nend`);
    expect(real(cst, "lambda")).toHaveLength(1);
    // rest params
    cst = parsesFully(`fn(x, y, z...) x`);
    expect(findAll(cst, "param")).toHaveLength(3);
    // arrow
    cst = parsesFully(`[x] => x + 1`);
    expect(real(cst, "lambda")).toHaveLength(1);
    // a lambda as an implicit-call argument
    cst = parsesFully(`callcc fn(c) c`);
    expect(real(cst, "call")).toHaveLength(1);
    // the README yin/yang line
    parsesFully(`let yinHelper = fn(char) fn(c) ((fn(cc) (print char; cc)) (callcc fn(c) c))`);
});

test("lists and objects", () => {
    let cst = parsesFully(`[1, x, 3]`);
    expect(findAll(cst, "brackets")).toHaveLength(1);
    expect(findAll(cst, "pair")).toHaveLength(0);
    cst = parsesFully(`[]`);
    expect(findAll(cst, "brackets")).toHaveLength(1);
    cst = parsesFully(`[foo: 1, bar: 2]`);
    expect(real(cst, "pair")).toHaveLength(2);
    cst = parsesFully(`[:]`);
    expect(findAll(cst, "brackets")).toHaveLength(1);
    // ternary colon is not a pair
    cst = parsesFully(`[a ? b : c]`);
    expect(findAll(cst, "pair")).toHaveLength(0);
});

test("quotes", () => {
    let cst = parsesFully("`(x + y)");
    expect(findAll(cst, "quote")).toHaveLength(1);
    cst = parsesFully("`name");
    expect(findAll(cst, "quote")).toHaveLength(1);
    cst = parsesFully("``(x)");
    expect(findAll(cst, "quote")).toHaveLength(1);
});

test("parens", () => {
    parsesFully(`(1 + 2) * 3`);
    parsesFully(`(print 1; print 2)`);
    parsesFully(`(a)`);
    parsesFully(`()`);
    parsesFully(`(f)(x)`);
});

test("soft keywords stay usable as names, never as call args", () => {
    parsesFully(`in`);
    parsesFully(`end`);
    parsesFully(`do`);
    // `f in` parses as `f`, leaving ` in` unconsumed (program's trailing ws takes the blank)
    const cst = parse(`f in`);
    expect(cst.end).toBe(2);
    expect(real(cst, "call")).toHaveLength(0);
});

test("README examples", () => {
    parsesFully(`print "Hello, World!"`);
    parsesFully(`["hello", "world", "!"] |?> it != "!" |*> upper it |+> that + it`);
    parsesFully(`let fizzbuzz = fn(n) n % 15 == 0? "fizzbuzz": n % 5 == 0? "buzz": n % 3 == 0? "fizz": "{n}"`);
    parsesFully(`foreach i in range(1, 100) do\n    print fizzbuzz i\nend`);
    parsesFully(`let yinHelper = fn(char) fn(c) ((fn(cc) (print char; cc)) (callcc fn(c) c))\nlet yin = (yinHelper "*"), yang = (yinHelper "@") in yin yang end`);
});
