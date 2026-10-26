import { last } from "lib0/array";
import { backolonGrammar, condenseCST, CSTNode, parseToCST, syncCompile } from "../src";

const SAMPLE_SCRIPT = `
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

## indexing: indexing, indexing_op, dot, up_dot, arrow
a.b.c;
a..b;
a->b;
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

## assignment: assignment, assign_op, normal_assign, old_assign,
## aug_assign, aug_assign_prefix
x = 1;
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

console.log(syncCompile(condenseCST(parseToCST(SAMPLE_SCRIPT, 0, "toplevel_exprs", backolonGrammar, "exprs", "BAD")), {
    exprs: [(nodes: CSTNode[]) => {
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
    r_string: [(nodes: CSTNode[]) => {
        return {
            val: nodes.map(n => n.children![0]!.text!.slice(n.type === "r_escape" ? 1 : 0)).join("")
        };
    }],
    i_string: [(nodes: CSTNode[], table: any) => {
        const x = nodes.reduce((prev, cur) => table.part[cur.type!](prev, cur.children![0]!, table), [""] as (string | CSTNode)[]);
        return {
            val: x,
            tbc: (x as CSTNode[]).flatMap((i, j) => typeof i !== "string" ? [[i, [j]]] : []),
            post: "i_stringPOST",
        }
    }, {
        part: {
            i_body(acc, cur) {
                if (typeof last(acc) !== "string") acc.push("");
                acc[acc.length - 1]! += cur.text!;
                return acc;
            },
            i_escape(acc, cur, table) {
                if (typeof last(acc) !== "string") acc.push("");
                const type = cur.type!;
                const txt = cur.children![0]!.text!;
                acc[acc.length - 1]! += type === "i_known_escape" ? table.known[txt] : table.decode[type](txt);
                return acc;
            },
            i_interpolation(acc, cur) {
                acc.push(cur);
                return acc;
            },
        } as Record<string, (acc: (string | CSTNode)[], cur: CSTNode, table: any) => (string | CSTNode)[]>,
        known: {
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
        decode: {
            i_x_escape: text => String.fromCodePoint(parseInt(text, 16)),
            i_u_escape: text => String.fromCodePoint(parseInt(text, 16)),
            i_U_escape: text => String.fromCodePoint(parseInt(text, 16)),
        }
    } as { known: Record<string, string>, decode: Record<string, (x: string) => string> }],
    i_stringPOST: [(nodes: (string | CSTNode)[]) => {
        const val = nodes.slice(1).reduce((acc, cur) => ["add", acc, cur] as any, nodes[0]);
        return {
            val
        }
    }],
    par_exp: [(nodes: [CSTNode]) => {
        return {
            val: undefined,
            tbc: [[nodes[0], []]],
        }
    }],
    implicit_call: [(nodes: [CSTNode, CSTNode]) => {
        const callee = nodes[0];
        const argv = nodes[1].children!;
        return {
            val: [],
            tbc: [callee, ...argv].map((x, i) => [x, [i]]),
        }
    }],
    sum: [(nodes: [CSTNode, CSTNode, CSTNode]) => {
        console.log("sum", nodes);
        throw 1;
    }],
    assignment: [(nodes: [CSTNode, CSTNode, CSTNode]) => {
        console.log("assignment", nodes);
        throw 1;
    }],
}, x => x));
