import { isString } from "lib0/function";
import { backolonGrammar, condenseCST, CSTNode, parseToCST, syncCompile } from "../src";

const SAMPLE_SCRIPT = `x |> y it |> z it`;

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

## calls: explicit_call, explicit_args, implicit_call,
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
a.b()..c();
a.(b);
a.b.c = d.e.f;

## prefix: prefix, prefix_op, negate, abs, not, bit_not, length,
## spread, ref, deref, special, lazy, unquote, unquote_splicing
-x;
+x;
!ok;
~mask;
#list;
...args;
&ptr;
*ptr;
@special;
^lazy;
$val;
$.vals;

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
## aug_assign, aug_assign_prefix
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

const cst = condenseCST(parseToCST(SAMPLE_SCRIPT, 0, "toplevel_exprs", backolonGrammar, "exprs", "BAD"));
if (process.argv.includes("--dump")) console.log(JSON.stringify(cst, null, 2));

else console.log(JSON.stringify(syncCompile(cst, {
    exprs: [(nodes: CSTNode[]) => {
        return {
            val: ["begin"],
            tbc: nodes.length === 1 ? [[nodes[0]!, []]] : nodes.map((i, j) => [i!, [j + 1]]),
        }
    }],
    body_exprs: [(nodes: CSTNode[]) => {
        return {
            val: ["begin"],
            tbc: nodes.length === 1 ? [[nodes[0]!, []]] : nodes.map((i, j) => [i!, [j + 1]]),
        }
    }],
    number: [(nodes: CSTNode[], table?: Record<string, number>) => {
        const node = nodes[0]!;
        const type = node.type!;
        const text = node.children![0]!.text!;
        const base = table![type];
        if (!base) throw new Error("unknown number type " + type);
        var n: BigInt | number | undefined;
        if (base === 10 && /[.e]/i.test(text)) {
            const [mantissa, exp] = text.split(/e/i);
            const [int, frac = ""] = mantissa!.split(".");
            const decimalPoint = Number(exp ?? 0) - frac.length;
            const sigFigs = BigInt(int + frac);
            if (Math.abs(decimalPoint) <= 10000) {
                if (decimalPoint >= 0) n = sigFigs * 10n ** BigInt(decimalPoint);
                else if (sigFigs % 10n ** BigInt(-decimalPoint) === 0n)
                    n = sigFigs / 10n ** BigInt(-decimalPoint);
            }
        } else {
            n = [...text].reduce((acc, ch) => acc * BigInt(base) + BigInt(parseInt(ch, base)), 0n);
        }
        if (n === undefined) n = parseFloat(text);
        else {
            var n2 = Number(n);
            n = Number.isFinite(n2) && BigInt(n2) === n ? n2 : n;
        }
        return {
            val: n,
        };
    }, {
        bin: 2,
        hex: 16,
        dec: 10,
    } as Record<string, number>],
    boolean: [(nodes: [CSTNode]) => {
        return {
            val: nodes[0]!.type === "boolean_true",
        };
    }],
    name: [(nodes: [CSTNode]) => {
        return {
            val: ["local", nodes[0]!.text],
        };
    }],
    regex: [(nodes: [CSTNode, CSTNode]) => {
        const body = nodes[0].text!;
        const flags = nodes[1].text!;
        return {
            val: new RegExp(body, flags),
        }
    }],
    r_string: [(nodes: CSTNode[]) => {
        return {
            val: nodes.map(n => n.children![0]!.text!.slice(n.type === "r_escape" ? 1 : 0)).join("")
        };
    }],
    i_string: [(nodes: CSTNode[], table: any) => {
        return {
            val: [],
            tbc: nodes.map((i, j) => [i, [j]]),
            post: "i_stringPOST",
        }
    }],
    i_body: [(nodes: [CSTNode]) => ({ val: nodes[0].text })],
    i_interpolation: [(nodes: [CSTNode]) => ({ val: 0, tbc: [[nodes[0], []]] })],
    i_x_escape: [(nodes: [CSTNode]) => ({ val: String.fromCodePoint(parseInt(nodes[0].text!, 16)) })],
    i_u_escape: [(nodes: [CSTNode]) => ({ val: String.fromCodePoint(parseInt(nodes[0].text!, 16)) })],
    i_U_escape: [(nodes: [CSTNode]) => ({ val: String.fromCodePoint(parseInt(nodes[0].text!, 16)) })],
    i_known_escape: [(nodes: [CSTNode], tab?: Record<string, string>) => {
        const text = nodes[0].text!;
        if (!Reflect.has(tab!, text)) {
            throw new Error(`unknown escape \\` + text);
        }
        return { val: tab![text] };
    }, {
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
    }],
    i_stringPOST: [(nodes: (string | CSTNode)[]) => {
        nodes = nodes.reduce((acc, item) => {
            const lastitem = acc.pop()!;
            console.error("lastitem", [lastitem, acc]);
            if (typeof lastitem === "string" && typeof item == "string") {
                acc.push(lastitem + item);
            } else {
                acc.push(lastitem, item);
            }
            return acc;
        }, [""] as (string | CSTNode)[]);
        console.error("asdfghjkl", nodes);
        return {
            val: nodes.slice(1).reduce((acc, cur) => ["add", acc, cur] as any, nodes[0])
        }
    }],
    par_exp: [(nodes: [CSTNode]) => ({ val: 0, tbc: [[nodes[0], []]] })],
    implicit_call: [(nodes: [CSTNode, CSTNode]) => {
        const callee = nodes[0];
        const argv = nodes[1].children!;
        return {
            val: [],
            tbc: [callee, ...argv].map((x, i) => [x, [i]]),
            post: "callPOST",
        }
    }],
    // TODO: this is the same as implicit_call
    explicit_call: [(nodes: [CSTNode, CSTNode]) => {
        const callee = nodes[0];
        const argv = nodes[1].children!;
        return {
            val: [],
            tbc: [callee, ...argv].map((x, i) => [x, [i]]),
            post: "callPOST",
        }
    }],
    empty_arg: [() => ({ val: ["empty"] })],
    callPOST: [(node: any[]) => {
        if (Array.isArray(node[0]) && node[0][0] === "local") {
            return { val: [node[0][1], ...node.slice(1)] }
        }
        return { val: node };
    }],
    binary_op: [(nodes: [CSTNode, CSTNode, CSTNode], table?: Record<string, [template: any, left: PropertyKey[], right: PropertyKey[], child?: PropertyKey[]]>) => {
        const left = nodes[0];
        const right = nodes[2];
        const op = nodes[1];
        const child = op.children?.[0];
        const opName = op.type!;
        const entry = table![opName];
        if (!entry) throw new Error("unknown binary operator type " + opName);
        const [template, leftPath, rightPath, childPath] = entry;
        if (isString(template)) {
            return {
                val: [left, right],
                post: template,
            }
        }
        return {
            val: structuredClone(template),
            tbc: [[left, leftPath], [right, rightPath], ...(childPath ? [[child, childPath] as [CSTNode, PropertyKey[]]] : [])],
        }
    }, {
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
        normal_assign: [["set"], [1], [2]],
        old_assign: [["set", , , true], [1], [2]],
        aug_assign: [["set________TODO"], [1], [2], [3]],
        arrow: [["set"], [2], [1]],
        kw: [["kw"], [1], [2]],
        dot: ["dotPRE", [], []],
        up_dot: ["up_dotPRE", [], []],
        normal_pipe: [["let", [["it"]]], [1, 0, 1], [2]],
        map_pipe: [["map", , ["fn", true, ["it"]]], [1], [2, 3]],
        filter_pipe: [["filter", , ["fn", true, ["it"]]], [1], [2, 3]],
        reduce_pipe: [["reduce", , , ["fn", true, ["_", "it"]]], [1], [3, 3], [2]],
    } as Record<string, [template: any, left: PropertyKey[], right: PropertyKey[], child?: PropertyKey[]]>],
    dotPRE: [(nodes: [CSTNode, CSTNode]) => {
        const left = nodes[0];
        const right = nodes[1];
        if (right.type === "name") {
            return {
                val: ["index", , right.children![0]!.text],
                tbc: [[left, [1]]]
            }
        }
        return {
            val: ["index"],
            tbc: [[left, [1]], [right, [2]]]
        }
    }],
    up_dotPRE: [(nodes: [CSTNode, CSTNode]) => {
        // TODO: a.qw.foo()..bar().baz()..bing()..bam() => (let x = (let x = a.qw in (x.foo(); x.bar))() in x.baz(); x.bing(); x.bam)()
        console.error("UP_DOT", nodes);
        return {
            val: "__UP_DOT_HERE__",
        }
    }],
    comparison: [(nodes: CSTNode[], tab?: Record<string, any>) => {
        const simple = nodes.length <= 3;
        if (simple) {
            const left = nodes[0]!;
            const right = nodes[2]!;
            const op = nodes[1]!;
            const opName = op.type!;
            const entry = tab![opName];
            if (!entry) throw new Error("unknown comparison operator type " + opName);
            return {
                val: [entry],
                tbc: [[left, [1]], [right, [2]]],
            }
        }
        // make func expression, but still honor short-circuiting rules
        // e.g. evaluate a, evaluate b, compare, if false, return false, else evaluate c and compare to b, etc.
        // compare(a, b, c, d, e) => let x = a, y = b in compare(x, y) and compare(y, c, d, e) end
        return {
            val: "__COMPARE_HERE__",
        }
    }, {
        equal: "eq",
        not_equal: "notEq"
    }],
    prefix: [(nodes: [CSTNode, CSTNode], table?: Record<string, any>) => {
        const func = table![nodes[0].type!];
        if (!func) throw new Error("unknown prefix operator type " + nodes[0].type);
        return {
            val: [func],
            tbc: [[nodes[1], [1]]],
        };
    }, {
        quote: "quote",
        unquote: "unquote",
        unquote_splicing: "unquote_splicing",
        negate: "sub",
        abs: "add",
        not: "not",
        bit_not: "bitInv",
        length: "length",
        spread: "splat",
        ref: "ref",
        deref: "deref",
        special: "resolve",
        lazy: "lazy",
    }],
    collection: [(nodes: [CSTNode]) => {
        console.error("collection", nodes);
        const hasMap = nodes.some(n => n.type === "");
        console.error("TODO TODO");
        return { val: "__COLLECTION_HERE__" };
    }],
    quasiquote: [(nodes: [CSTNode]) => {
        return {
            val: ["quasiquote"],
            tbc: [[nodes[0], [1]]],
        }
    }],
    ternary: [(nodes: [CSTNode, CSTNode, CSTNode]) => {
        return {
            val: ["if"],
            tbc: [[nodes[0], [1]], [nodes[1], [2]], [nodes[2], [3]]],
        }
    }],
    if: [(nodes: [CSTNode, CSTNode]) => {
        const cond = nodes[0], body = nodes[1];
        if (body.type === "if_no_else") {
            return {
                val: ["if"],
                tbc: [[cond, [1]], [body.children![0]!, [2]]],
            }
        }
        const [ifTrue, ifFalse] = body.children!;
        return {
            val: ["if"],
            tbc: [[cond, [1]], [ifTrue!, [2]], [ifFalse!, [3]]],
        }
    }],
    let: [(nodes: [CSTNode]) => {
        const node = nodes[0];
        const type = node.type!;
        switch (type) {
            case "simple_let":
                console.error("LET_SIMPLE", node.children);
                break;
            case "let_block":
                console.error("LET_BLOCK", node.children);
                break;
            case "let_loop_block":
                console.error("LET_LOOP_BLOCK", node.children);
                break;
            default:
                throw new Error("unknown let type " + type);
        }
        return { val: "__LET_HERE__" }
    }]
}, x => x, x => { return ["TBC", x]; throw x instanceof Error ? x : Error(x); }), (_, x) => typeof x === "bigint" ? ["BIGINT", x + ""] : x, 2));
