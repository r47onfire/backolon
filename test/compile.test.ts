import { CSTNode, describeCombinator, parseToCST } from "@r47onfire/nebula";
import { condenseCST, syncCompile } from "@r47onfire/nebula/compile";
import { last } from "lib0/array";
import { backolonGrammar, gensym, Identifier } from "../src";

const SAMPLE_SCRIPT = `[:__add__: 1]`;

`
## comments: comment, line_comment, block_comment, blank
## a trailing line comment
##[[ a block comment ##]]
##[[ nested ##[[ block comment ##]] still a comment ##]]

## numbers: number, hex, bin, decimal
0x1F;
0xc0ffee;
0b1010;
123;
3.14;
.5;
1.e+4;
1.e+400; ## Should be turned into BigInt so as to not overflow
1.5e-3;

## names and booleans: name, boolean, boolean_true, boolean_false
true;
false;
True;
FALSE;
foo;
_bar;
foo123;
𓆏;  ## unicode name test

## soft keywords as names (the guard is reset inside parens): par_exp
(else);
(in);
(end);

## strings: string, r_string, r_part, r_body, r_escape
'hello';
'it\\'s';
## i_string, i_part, i_body, i_escape, i_escape_body, i_known_escape
"hello";
"esc: \\n \\t \\" \\' \\a \\z";
## i_x_escape, i_u_escape, i_U_escape
"\\x41\\x5c";
"\\u00e9";
"\\U{1f600}";
## i_interpolation
"fizzbuzz: \\(n) mississippi";
"multi: \\(
    print 1
    1 + 2
) done";

## regex: regex, regex_body, regex_flags
re1 = /ab+c/;
re2 = /[a-z]+\\d/gi;

## collections: collection, collection_body, collection_item,
## ws_comma, comma, empty_collection, empty_list, empty_map
[1, x, 3];
[];
[:];
[1, 2, 3,];
[[1, 2], [3]];
## kw_arg, kw_arg_op, kw (map entries are keyword arguments)
[foo: 1, bar: 2];
## collection_shorthand
[\`foo:];
[\`foo:, \`bar: baz];

## quasiquote, quote, unquote, unquote_splicing
{x + 1};
{$x};
{$.xs};
\`(x + y);
\`name;

## par_exp (parenthesized expressions)
(1 + 2) * 3;
(a);
();

## calls
## implicit_args, empty_arg, blank_sameline, blank_required
print(1, 2);
print (1, 2);
print();
print(1,,2);
print(1,);
print(1)(2);
print 1, 2;
print print 1, 2;
print 1,,2;
configure mode: "fast", level: 3;

## indexing: indexing, indexing_op, dot, up_dot
a.b.c;
a?.b.c;
a..b()..c();
a.(b);
a.b.c = d.e.f;

## prefix: prefix, prefix_op, negate, abs, not, bit_not, length,
## splat, ref, deref, special, lazy, unquote, unquote_splicing
-x;
+x;
!ok;
~mask;
#list;
.option;
...args;
&ptr;
*ptr;
@special;
^lazy;
$val;
$.vals;
:interned_sym;
::unique_sym;

## sum, sum_op, add, sub, term, term_op, mul, div, mod,
## factor, factor_op, pow
1 + 2 * 3 - 4 / 5 % 6;
2 ** 3 ** 2;
## bitshift, bitshift_op, shift_left, shift_right
a << 2 >> 1;
## bitwise, bitwise_op, bitwise_and, bitwise_or, bitwise_xor
a & b | c ^ d;
## containment, containment_op, needle_in_haystack, haystack_has_needle
needle <: haystack;
needle in haystack;
haystack :> needle;
haystack has needle;
## comparison, comparison_op, equal, not_equal, lte, gte, less, greater
a == b != c <= d >= e < f > g;
## logical, logical_op, logical_and, logical_or
a || b;
a && b;
a and b or c;
## ternary
a ? b : c;
n % 15 == 0 ? "fizzbuzz" : n % 5 == 0 ? "buzz" : "\\(n)";

## pipes: pipe, pipe_op, normal_pipe, filter_pipe, map_pipe, reduce_pipe
a |> b it |> c it;
["hello", "world", "!"] |?> it != "!" |*> upper it;
xs |+>[init] _ + it;

## assignment: assignment, transposed_assignment, assign_op, normal_assign, old_assign,
## add_assign, sub_assign, mul_assign, div_assign, mod_assign, format_assign, pow_assign,
## shift_left_assign, shift_right_assign, bitwise_and_assign, bitwise_or_assign,
## bitwise_xor_assign, logical_and_assign, logical_or_assign
x = 1;
1 -> x;
a = b <- 1;
x += 1;
x -= 1;
x *= 2;
x /= 2;
x %= 2;
x **= 2;
x &= mask;
x |= mask;
x ^= mask;
x <<= 1;
x >>= 1;
x &&= y;
x and= y;
x ||= y;
x or= y;

## let, simple_let, let_block, let_loop_block
let a = b;
let x = a, y = b in foo x end;
let(loop) x = a in foo loop end;

## if, if_else, if_no_else, body_exprs
if a == b then c() end;
if a == b then c() else d() end;
if a == b
    c()
else
    d()
end;
if a == b
    c()
end;

## while
while a == b do c() end;
while a == b
    c()
end;

## for
for i = range 1, 100 do print fizzbuzz i end;
for i = range 1, 100
    print fizzbuzz i
end;

## trycatch, trycatch_guarded, trycatch_handler,
## trycatch_else, trycatch_finally
try x() catch e = ENOENT do b(e) end catch e = EPERM do c(e) end;
try
    x()
catch e = ENOENT
    b(e)
else
    foo()
finally
    bar()
end;

## with, always, do, strong_block
with resource
    use resource
end;
always @(tick)
    print "tick changed"
end;
do
    print "block"
end;
begin
    print "block"
end;
schedule do print "later" end;

## fn
fn(x) x + 1;
fn(x)
    x + 1
end;
fn(x, y, ...z) x;
fn() 42;
fn(x) callcc fn(c) c;
map xs, fn(x) x * 2;

## separators: exprs, expr_sep, semi, nl
print 1; print 2;
print 1
print 2
print 1;;;;;;;;;print 2
`;

const makeSyntaxErrorNode = (node: CSTNode<any>, msg: string) => [
    "throw",
    ["err", "ESYNTAX", msg],
];

const beginBody = [
    (nodes: CSTNode<any>[]) => {
        return nodes.length === 1
            ? {
                  val: [],
                  tbc: [[nodes[0]!, []]],
              }
            : {
                  val: ["begin"],
                  tbc: nodes.map((i, j) => [i!, [j + 1]]),
                  post: "flatten_all_begin",
              };
    },
] as Parameters<typeof syncCompile>[1][number];

// Root a cascade section at the receiver: descend the section's left
// spine (a call's callee, an indexing lhs, an assignment's target, any
// other binary lhs) to the root primary and replace it with an
// indexing node over the receiver. The root is the section's key: a
// name, a number, or a par_exp, the same set the grammar allows after
// a dot.
const rootSection = (
    section: CSTNode<any>,
    receiver: CSTNode<any>,
    nullHead: boolean,
): CSTNode<any> | null => {
    const descend = (node: CSTNode<any>): CSTNode<any> | null => {
        switch (node.type) {
            case "call":
            case "dot":
            case "null_dot":
            case "comparison": {
                const head = descend(node.children![0]!);
                return head === null
                    ? null
                    : { ...node, children: [head, ...node.children!.slice(1)] };
            }
            case "name":
            case "number":
            case "par_exp":
                return {
                    type: nullHead ? "null_dot" : "dot",
                    span: node.span,
                    children: [receiver, node],
                };
            default:
                return null;
        }
    };
    return descend(section);
};

// One cascade link - root this link's section at the receiver and
// discard its value, then compile the rest of the chain, then yield
// the receiver itself.
const cascadePRE =
    (nullHead: boolean): Parameters<typeof syncCompile>[1][number][0] =>
    (nodes: [CSTNode<any>, CSTNode<any>]) => {
        const [left, right] = nodes;
        let section = right,
            rest: [string, CSTNode<any>] | undefined;
        if (right.type === "up_dot" || right.type === "up_dot_null") {
            section = right.children![0]!;
            rest = [right.type, right.children![1]!];
        }
        const temp = left.type === "name" ? undefined : gensym("cascade");
        const receiver: CSTNode<any> =
            temp === undefined
                ? left
                : {
                      type: "name",
                      span: left.span,
                      children: [
                          {
                              text: temp as any,
                              span: left.span,
                          },
                      ],
                  };
        const rooted = rootSection(section, receiver, nullHead);
        if (rooted === null)
            return {
                val: makeSyntaxErrorNode(
                    section,
                    "cascade section must start with a name, number, or (expression)",
                ),
            };
        const stmts: CSTNode<any>[] = [rooted];
        if (rest)
            stmts.push({
                type: nullHead ? "up_dot_null" : rest[0],
                span: right.span,
                children: [receiver, rest[1]],
            });
        const tbc: [CSTNode<any>, PropertyKey[]][] = stmts.map(
            (stmt, i) => [stmt, [i + 1]] as [CSTNode<any>, PropertyKey[]],
        );
        // only the last link appends the receiver as the value: when
        // there is a rest, its compiled form already ends with it
        if (!rest) tbc.push([receiver, [stmts.length + 1]]);
        if (temp === undefined)
            return { val: ["begin"], tbc, post: "flatten_all_begin" };
        return {
            val: ["let", [[temp, undefined]], ["begin"]],
            tbc: [
                [left, [1, 0, 1]],
                ...tbc.map(
                    ([node, path]) =>
                        [node, [2, ...path]] as [CSTNode<any>, PropertyKey[]],
                ),
            ],
            post: "flatten_all_begin",
        };
    };

const dotPRE =
    (
        val: string,
        transposed = false,
    ): Parameters<typeof syncCompile>[1][number][0] =>
    (nodes: [CSTNode<any>, CSTNode<any>]) => {
        const left = nodes[0];
        const right = nodes[1];
        if (transposed) {
            if (left.type === "name") {
                return {
                    val: [val, left.children![0]!.text],
                    tbc: [[right, [2]]],
                };
            }
        } else {
            if (right.type === "name") {
                return {
                    val: [val, , right.children![0]!.text],
                    tbc: [[left, [1]]],
                };
            }
        }
        return {
            val: [val],
            tbc: [
                [left, [1]],
                [right, [2]],
            ],
        };
    };

// Binary operators: since the grammar's nodes adopted their operator's
// name, each operator is its own node type, so the old binary_op dispatch
// is now one table entry per operator, all sharing the one handler; the
// entry's mapping slot carries that operator's template. An operator that
// captured a payload (a reduce pipe's initial value) carries it as a
// middle child, between the operands.
type BinaryTemplate = [
    template: any,
    left: PropertyKey[],
    right: PropertyKey[],
    child?: PropertyKey[],
];
const binaryOpTemplates: Record<string, BinaryTemplate> = {
    add: [["add"], [1], [2]],
    sub: [["sub"], [1], [2]],
    mul: [["mul"], [1], [2]],
    div: [["div"], [1], [2]],
    mod: [["mod"], [1], [2]],
    pow: [["pow"], [1], [2]],
    shift_right: [["shr"], [1], [2]],
    shift_left: [["shl"], [1], [2]],
    bitwise_xor: [["bitXor"], [1], [2]],
    bitwise_and: [["bitAnd"], [1], [2]],
    bitwise_or: [["bitOr"], [1], [2]],
    logical_and: [["and"], [1], [2]],
    logical_or: [["or"], [1], [2]],
    needle_in_haystack: [["in"], [1], [2]],
    haystack_has_needle: [["in"], [2], [1]],
    normal_predicate: [[], [1], [0]],
    inverted_predicate: [
        ["not", []],
        [1, 1],
        [1, 0],
    ],
    normal_assign: [["assign"], [1], [2]],
    old_assign: [["assign", , , true], [1], [2]],
    arrow: [["assign"], [2], [1]],
    normal_pipe: [["let", [["it"]]], [1, 0, 1], [2]],
    map_pipe: [["map", , ["fn", true, ["it"]]], [1], [2, 3]],
    filter_pipe: [["filter", , ["fn", true, ["it"]]], [1], [2, 3]],
    reduce_pipe: [["reduce", , , ["fn", true, ["_", "it"]]], [1], [3, 3], [2]],
};
const binaryOp = (nodes: CSTNode<any>[], entry?: BinaryTemplate) => {
    const [template, leftPath, rightPath, childPath] = entry!;
    const left = nodes[0]!;
    const right = nodes[nodes.length - 1]!;
    const child = nodes.length > 2 ? nodes[1] : undefined;
    return {
        val: structuredClone(template),
        tbc: [
            [left, leftPath],
            [right, rightPath],
            ...(childPath
                ? [[child, childPath] as [CSTNode<any>, PropertyKey[]]]
                : []),
        ] as [CSTNode<any>, PropertyKey[]][],
    };
};
const binaryOpEntries = Object.fromEntries(
    Object.entries(binaryOpTemplates).map(([op, entry]) => [
        op,
        [binaryOp, entry],
    ]),
) as Parameters<typeof syncCompile>[1];
// an augmented assignment (add_assign for +=) compiles to an assignment
// whose value is the base operator applied to a placeholder for the
// target and the right side
const augAssign =
    (base: string): Parameters<typeof syncCompile>[1][number][0] =>
    (
        nodes: [CSTNode<any>, CSTNode<any>],
        _table?: any,
        node?: CSTNode<any>,
    ) => {
        const [left, right] = nodes;
        return {
            val: ["assign"],
            tbc: [
                [left, [1]],
                [
                    {
                        type: base,
                        span: node!.span,
                        children: [
                            {
                                type: "name",
                                span: node!.span,
                                children: [{ text: "_", span: node!.span }],
                            },
                            right,
                        ],
                    },
                    [2],
                ],
            ] as [CSTNode<any>, PropertyKey[]][],
        };
    };

const id: (typeof JSON)["stringify"] = (x: any, ...x2: any[]): string =>
    Bun.inspect(x, { colors: !process.env.NO_COLOR, depth: Infinity });

const handlers: Parameters<typeof syncCompile>[1] = {
    exprs: beginBody,
    body_exprs: beginBody,
    par_exp: [
        (nodes: CSTNode<any>[]) => {
            return {
                val: ["begin"],
                tbc:
                    nodes.length === 1
                        ? [[nodes[0]!, []]]
                        : nodes.map((i, j) => [i!, [j + 1]]),
            };
        },
    ],
    number: [
        (nodes: CSTNode<any>[], table?: Record<string, number>) => {
            const node = nodes[0]!;
            const type = node.type!;
            const text = node.children![0]!.text!;
            const base = table![type];
            if (!base) throw new Error("unknown number type " + type);
            let n: BigInt | number | undefined;
            if (base === 10 && /[.e]/i.test(text)) {
                const [mantissa, exp] = text.split(/e/i);
                const [int, frac = ""] = mantissa!.split(".");
                const decimalPoint = Number(exp ?? 0) - frac.length;
                const sigFigs = BigInt(int + frac);
                if (Math.abs(decimalPoint) <= 10000) {
                    if (decimalPoint >= 0)
                        n = sigFigs * 10n ** BigInt(decimalPoint);
                    else if (sigFigs % 10n ** BigInt(-decimalPoint) === 0n)
                        n = sigFigs / 10n ** BigInt(-decimalPoint);
                }
            } else {
                n = [...text].reduce(
                    (acc, ch) =>
                        acc * BigInt(base) + BigInt(parseInt(ch, base)),
                    0n,
                );
            }
            if (n === undefined) n = parseFloat(text);
            else {
                let n2 = Number(n);
                n = Number.isFinite(n2) && BigInt(n2) === n ? n2 : n;
            }
            return {
                val: n,
            };
        },
        {
            bin: 2,
            hex: 16,
            dec: 10,
        } as Record<string, number>,
    ],
    boolean: [
        (nodes: [CSTNode<any>]) => {
            return {
                val: nodes[0]!.type === "boolean_true",
            };
        },
    ],
    name: [
        (nodes: [CSTNode<any>]) => {
            return {
                val: ["local", nodes[0]!.text],
            };
        },
    ],
    regex: [
        (nodes: [CSTNode<any>, CSTNode<any>]) => {
            const body = nodes[0].text!;
            const flags = nodes[1].text!;
            return {
                val: new RegExp(body, flags),
            };
        },
    ],
    r_string: [
        (nodes: CSTNode<any>[]) => {
            return {
                val: nodes
                    .map((n) =>
                        n.children![0]!.text!.slice(
                            n.type === "r_escape" ? 1 : 0,
                        ),
                    )
                    .join(""),
            };
        },
    ],
    i_string: [
        (nodes: CSTNode<any>[], table: any) => {
            return {
                val: [],
                tbc: nodes.map((i, j) => [i, [j]]),
                post: "i_stringPOST",
            };
        },
    ],
    i_body: [(nodes: [CSTNode<any>]) => ({ val: nodes[0].text })],
    i_interpolation: [
        (nodes: [CSTNode<any>]) => ({
            val: 0,
            tbc: [[nodes[0], []]],
        }),
    ],
    i_x_escape: [
        (nodes: [CSTNode<any>]) => ({
            val: String.fromCodePoint(parseInt(nodes[0].text!, 16)),
        }),
    ],
    i_u_escape: [
        (nodes: [CSTNode<any>]) => ({
            val: String.fromCodePoint(parseInt(nodes[0].text!, 16)),
        }),
    ],
    i_U_escape: [
        (nodes: [CSTNode<any>]) => ({
            val: String.fromCodePoint(parseInt(nodes[0].text!, 16)),
        }),
    ],
    i_known_escape: [
        (nodes: [CSTNode<any>], tab?: Record<string, string>) => {
            const text = nodes[0].text!;
            if (!Reflect.has(tab!, text)) {
                return {
                    val: makeSyntaxErrorNode(nodes[0], "unknown escape"),
                };
            }
            return { val: tab![text] };
        },
        {
            a: "\a",
            b: "\b",
            e: "\x1b",
            f: "\f",
            n: "\n",
            r: "\r",
            t: "\t",
            v: "\v",
            z: "\0",
            '"': '"',
            "'": "'",
            "\\": "\\",
        },
    ],
    i_stringPOST: [
        (nodes: (string | CSTNode<any>)[]) => {
            nodes = nodes.reduce(
                (acc, item) => {
                    const lastitem = acc.pop()!;
                    if (
                        typeof lastitem === "string" &&
                        typeof item == "string"
                    ) {
                        acc.push(lastitem + item);
                    } else {
                        acc.push(lastitem, item);
                    }
                    return acc;
                },
                [""] as (string | CSTNode<any>)[],
            );
            return {
                val: nodes
                    .slice(1)
                    .reduce((acc, cur) => ["add", acc, cur] as any, nodes[0]),
            };
        },
    ],
    call: [
        (nodes: [CSTNode<any>, CSTNode<any>]) => {
            const callee = nodes[0];
            const argv = nodes[1].children!;
            return {
                val: [],
                tbc: [callee, ...argv].map((x, i) => [x, [i]]),
            };
        },
    ],
    empty_arg: [() => ({ val: ["empty"] })],
    ...binaryOpEntries,
    kw: [dotPRE("kw", true)],
    dot: [dotPRE("index")],
    null_dot: [dotPRE("index_null")],
    up_dot: [cascadePRE(false)],
    up_dot_null: [cascadePRE(true)],
    logical_and_assign: [augAssign("logical_and")],
    logical_or_assign: [augAssign("logical_or")],
    bitwise_and_assign: [augAssign("bitwise_and")],
    bitwise_or_assign: [augAssign("bitwise_or")],
    bitwise_xor_assign: [augAssign("bitwise_xor")],
    shift_left_assign: [augAssign("shift_left")],
    shift_right_assign: [augAssign("shift_right")],
    add_assign: [augAssign("add")],
    sub_assign: [augAssign("sub")],
    mul_assign: [augAssign("mul")],
    div_assign: [augAssign("div")],
    mod_assign: [augAssign("mod")],
    format_assign: [augAssign("format")],
    pow_assign: [augAssign("pow")],
    comparison: [
        (nodes: CSTNode<any>[], tab?: Record<string, any>) => {
            const simple = nodes.length < 4;
            const getOp = (opName: string) => {
                const entry = tab![opName];
                if (!entry)
                    throw new Error(
                        "unknown comparison operator type " + opName,
                    );
                return entry;
            };
            if (simple) {
                return {
                    val: [getOp(nodes[1]!.type!)],
                    tbc: [
                        [nodes[0]!, [1]],
                        [nodes[2]!, [2]],
                    ],
                };
            }
            // make func expression, but still honor short-circuiting rules
            // e.g. evaluate a, evaluate b, compare, if false, return false, else evaluate c and compare to b, etc.
            // compare(a, b, c, d, e) => let x = a, y = b in compare(x, y) and compare(y, c, d, e) end
            return {
                val: [
                    nodes.flatMap((x, i) => (i & 1 ? [getOp(x.type!)] : [])),
                    [],
                ],
                tbc: nodes.flatMap((x, i) => (i & 1 ? [] : [[x, [1, i >> 1]]])),
                post: "comparisonPOST",
            };
        },
        {
            equal: "eq",
            not_equal: "notEq",
            greater: "greater",
            less: "less",
            gte: "greaterEq",
            lte: "lessEq",
        },
    ],
    comparisonPOST: [
        (nodes: [any[], CSTNode<any>[]]) => {
            const ops = nodes[0];
            const operands = nodes[1];
            // Each pair is its own binary call, joined by `and`: the chain
            // short-circuits pair by pair, so an operand is evaluated only
            // once every comparison before it has passed. The shared operand
            // between two adjacent pairs is bound by a let so it is still
            // evaluated exactly once.
            // a < b < c == d => let x = a, y = b in (less x y) and (let z = c in (less y z) and (eq z d))
            const build = (
                first: any,
                rest: any[],
                restOps: string[],
                firstBound: boolean,
            ): any => {
                if (restOps.length === 1) return [restOps[0], first, rest[0]];
                const x = gensym("cmp"),
                    y = gensym("cmp");
                // firstBound tracks structurally whether `first` is already a
                // bound local (true for the recursive calls, which pass the
                // previous step's y) instead of inspecting the compiled form,
                // whose shape is opaque
                const pairs: [Identifier, any][] = firstBound
                    ? [[y, rest[0]]]
                    : [
                          [x, first],
                          [y, rest[0]],
                      ];
                return [
                    "let",
                    pairs,
                    [
                        "and",
                        [
                            restOps[0],
                            firstBound ? first : ["local", x],
                            ["local", y],
                        ],
                        build(
                            ["local", y],
                            rest.slice(1),
                            restOps.slice(1),
                            true,
                        ),
                    ],
                ];
            };
            return {
                val: build(operands[0], operands.slice(1), ops, false),
            };
        },
    ],
    func_prefix: [
        (nodes: [CSTNode<any>, CSTNode<any>], table?: Record<string, any>) => {
            const type = nodes[0].type!;
            const func = structuredClone(table![nodes[0].type!]);
            if (!func)
                throw new Error("unknown func_prefix operator type " + type);
            return {
                val: Array.isArray(func) ? func : [func],
                tbc: [[nodes[1], [1]]],
            };
        },
        {
            quote: "quote",
            unquote: "unquote",
            unquote_splicing: "unquote_splicing",
            negate: "sub",
            abs: "add",
            not: "not",
            bit_not: "bitInv",
            length: "length",
            splat: ["splat", , false],
            splat_kw: ["splat", , true],
            ref: "ref",
            deref: "deref",
            special: "resolve",
            lazy: "lazy",
        },
    ],
    member_prefix: [
        (nodes: [CSTNode<any>, CSTNode<any>], table?: Record<string, any>) => {
            const type = nodes[0].type!;
            const func = structuredClone(table![type]);
            if (!func)
                throw new Error("unknown member_prefix operator type " + type);
            const right = nodes[1];
            if (right.type === "name") {
                const val = Array.isArray(func) ? func : [func];
                val[1] = right.children![0]!.text;
                return { val };
            }
            return {
                val: Array.isArray(func) ? func : [func],
                tbc: [[right, [1]]],
            };
        },
        {
            sym: ["sym", , false],
            unique_sym: ["sym", , true],
            option: "option",
        },
    ],
    collection: [
        (nodes: [CSTNode<any>]) => {
            if (nodes.length === 1 && nodes[0]!.type === "empty_list")
                return { val: ["list"] };
            if (nodes.length === 1 && nodes[0]!.type === "empty_map")
                return { val: {} };
            const isSplat = (n: CSTNode<any>) =>
                n.type === "func_prefix" &&
                (n.children![0]!.type === "splat" ||
                    n.children![0]!.type === "splat_kw");
            const isKeyed = (n: CSTNode<any>) =>
                n.type === "collection_shorthand" ||
                n.type === "kw" ||
                (n.type === "func_prefix" &&
                    n.children![0]!.type === "splat_kw");
            if (!nodes.some(isKeyed)) {
                return {
                    val: ["list"],
                    tbc: nodes.map(
                        (n, i) => [n, [i + 1]] as [CSTNode<any>, PropertyKey[]],
                    ),
                };
            }
            // A keyed collection is an (object key value...) call: a name
            // or quoted name key is static text in its slot, any other key
            // (a number, a sym, a par_exp, ...) is computed -- the object
            // call evaluates its key slots, so the key expression compiles
            // into the slot like a value does.
            // Splats compile through as arguments: a keyword splat merges its
            // entries, a positional splat splices into the key/value stream
            const isStaticKey = (key: CSTNode<any>): boolean =>
                key.type === "name" ||
                (key.type === "quote_prefix" &&
                    key.children![0]!.type === "quote");
            const keyText = (key: CSTNode<any>): string => {
                if (key.type === "name") return key.children![0]!.text!;
                if (
                    key.type === "quote_prefix" &&
                    key.children![0]!.type === "quote"
                )
                    return key.children![1]!.children![0]!.text!;
                // a key that is not a name becomes a deferred error in the
                // key slot: it throws only if the collection is evaluated
                return makeSyntaxErrorNode(
                    key.children![0]!,
                    "collection key must be a name",
                ) as any as string;
            };
            const val: any[] = ["object"];
            const tbc: [CSTNode<any>, PropertyKey[]][] = [];
            const val2: any = {};
            const tbc2: [CSTNode<any>, PropertyKey[]][] = [];
            let allConstant = true; // should be true but this is broken
            for (let n of nodes) {
                if (isSplat(n)) {
                    val.push(null);
                    tbc.push([n, [val.length - 1]]);
                    allConstant = false;
                } else if (n.type === "collection_shorthand") {
                    const nameNode = n.children![0]!;
                    const name = nameNode.children![0]!.text!;
                    val.push(name, null);
                    tbc.push([nameNode, [val.length - 1]]);
                    tbc2.push([nameNode, [name]]);
                } else if (isKeyed(n)) {
                    const key = n.children![0]!;
                    const item = n.children![1]!;
                    if (isStaticKey(key)) {
                        const name = keyText(key);
                        val.push(name, null);
                        tbc2.push([item, [name]]);
                    } else {
                        val.push(null, null);
                        tbc.push([key, [val.length - 2]]);
                        allConstant = false;
                    }
                    tbc.push([item, [val.length - 1]]);
                } else {
                    val.push(
                        makeSyntaxErrorNode(n, "expected key-value pair"),
                        null,
                    );
                    tbc.push([n, [val.length - 1]]);
                    allConstant = false;
                }
            }
            return allConstant ? { val: val2, tbc: tbc2 } : { val, tbc };
        },
    ],
    quasiquote: [
        (nodes: [CSTNode<any>]) => {
            return {
                val: ["quasiquote"],
                tbc: [[nodes[0], [1]]],
                post: "flatten_final_begin",
            };
        },
    ],
    flatten_final_begin: [
        (nodes: any[]) => {
            if (Array.isArray(last(nodes)) && last(nodes)[0] === "begin") {
                return {
                    val: [...nodes.slice(0, -1), ...last(nodes).slice(1)],
                };
            }
            return { val: nodes };
        },
    ],
    flatten_all_begin: [
        (nodes: any[]) => {
            let post: string | undefined;
            const val = nodes.flatMap((node) => {
                // TODO: this will break when node is wrapped in at()
                if (Array.isArray(node) && node[0] === "begin") {
                    // we should recurse
                    post = "flatten_all_begin";
                    return node.slice(1);
                }
                return [node];
            });
            return { val, post };
        },
    ],
    ternary: [
        (nodes: [CSTNode<any>, CSTNode<any>, CSTNode<any>]) => {
            return {
                val: ["if"],
                tbc: [
                    [nodes[0], [1]],
                    [nodes[1], [2]],
                    [nodes[2], [3]],
                ],
            };
        },
    ],
    if: [
        (nodes: [CSTNode<any>, CSTNode<any>]) => {
            const cond = nodes[0],
                body = nodes[1];
            if (body.type === "if_no_else") {
                return {
                    val: ["if"],
                    tbc: [
                        [cond, [1]],
                        [body.children![0]!, [2]],
                    ],
                };
            }
            const [ifTrue, ifFalse] = body.children!;
            return {
                val: ["if"],
                tbc: [
                    [cond, [1]],
                    [ifTrue!, [2]],
                    [ifFalse!, [3]],
                ],
            };
        },
    ],
    let: [
        (nodes: [CSTNode<any>]) => {
            const node = nodes[0];
            const bindings = (argsNode: CSTNode<any>) =>
                argsNode.children!.map((binding) => {
                    if (binding.type === "name")
                        return [binding.children![0]!.text!, undefined] as [
                            string,
                            CSTNode<any> | undefined,
                        ];
                    const [target, , value] = binding.children!;
                    return [target!.children![0]!.text!, value] as [
                        string,
                        CSTNode<any> | undefined,
                    ];
                });
            // tbc entries for the bindings that have a value to compile;
            // a bare binding keeps the undefined already in its value slot
            const valueTbc = (
                pairs: [string, CSTNode<any> | undefined][],
                path: (i: number) => PropertyKey[],
            ) =>
                pairs.flatMap(([, value], i) =>
                    value
                        ? [[value, path(i)] as [CSTNode<any>, PropertyKey[]]]
                        : [],
                );
            switch (node.type) {
                case "simple_let": {
                    const pairs = bindings(node.children![0]!);
                    return {
                        val: [
                            "letIn",
                            ...pairs.flatMap(([name]) => [name, undefined]),
                        ],
                        tbc: valueTbc(pairs, (i) => [2 * i + 2]),
                    };
                }
                case "let_block": {
                    const pairs = bindings(node.children![0]!);
                    return {
                        val: ["let", pairs.map(([name]) => [name, undefined])],
                        tbc: [
                            ...valueTbc(pairs, (i) => [1, i, 1]),
                            [node.children![1]!, [2]],
                        ],
                        post: "flatten_final_begin",
                    };
                }
                case "let_loop_block": {
                    const loopName = node.children![0]!.children![0]!.text!;
                    const block = node.children![1]!;
                    const pairs = bindings(block.children![0]!);
                    return {
                        val: [
                            "let",
                            loopName,
                            pairs.map(([name]) => [name, undefined]),
                        ],
                        tbc: [
                            ...valueTbc(pairs, (i) => [2, i, 1]),
                            [block.children![1]!, [3]],
                        ],
                        post: "flatten_final_begin",
                    };
                }
                default:
                    throw new Error("unknown let type " + node.type);
            }
        },
    ],
    while: [
        (nodes: [CSTNode<any>, CSTNode<any>]) => {
            return {
                val: ["while"],
                tbc: [
                    [nodes[0], [1]],
                    [nodes[1], [2]],
                ],
                post: "flatten_final_begin",
            };
        },
    ],
    for: [
        (nodes: CSTNode<any>[]) => {
            console.error(nodes);
            throw "FOR";
        },
    ],
    trycatch: [
        (nodes: CSTNode<any>[]) => {
            console.error(nodes);
            throw "TRYCATCH";
        },
    ],
    with: [
        (nodes: CSTNode<any>[]) => {
            console.error(nodes);
            throw "WITH";
        },
    ],
    fn: [
        (nodes: CSTNode<any>[]) => {
            console.error(nodes);
            throw "FN";
        },
    ],
    always: [
        (nodes: CSTNode<any>[]) => {
            console.error(nodes);
            throw "ALWAYS";
        },
    ],
    do: beginBody,
    BAD: [
        (_, __, node) => {
            console.error("BAD", node);
            return {
                val: makeSyntaxErrorNode(
                    node,
                    "expected " + describeCombinator(node.errorExpected!),
                ),
            };
        },
    ],
};

const cst = condenseCST(
    parseToCST(
        SAMPLE_SCRIPT,
        new URL("sample:"),
        0,
        "toplevel_exprs",
        backolonGrammar,
        "exprs",
        "BAD",
    ),
);
if (process.argv.includes("--dump")) console.log(JSON.stringify(cst, null, 2));
else
    console.log(
        id(
            syncCompile(
                cst,
                handlers,
                (x) => x,
                (x) => {
                    throw x instanceof Error ? x : Error(x);
                },
            ),
            (_, x) =>
                typeof x === "bigint"
                    ? ["BIGINT", x + ""]
                    : typeof x === "symbol"
                      ? ["SYMBOL", String(x)]
                      : x === undefined
                        ? ["UNDEFINED"]
                        : x,
            2,
        ),
    );
