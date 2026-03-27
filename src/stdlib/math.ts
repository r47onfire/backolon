import { NativeModule, rewriteAsApply, symbol_x, symbol_y } from ".";
import { boxNumber, boxString, ThingType } from "../objects/thing";

export function math(mod: NativeModule) {
    mod.defop("__builtin_plus", "plus");
    mod.defsyntax("x + y", 4, false, null, "__rewrite_plus", rewriteAsApply([symbol_x, symbol_y], "__builtin_plus"));
    mod.defoverload("plus", [ThingType.number, ThingType.number], (loc, argv) => {
        const x = argv[0].v, y = argv[1].v;
        const naiveSum = Number(x) + Number(y);
        const bestSum = naiveSum > Number.MAX_SAFE_INTEGER || naiveSum < Number.MIN_SAFE_INTEGER ? BigInt(x) + BigInt(y) : naiveSum;
        return boxNumber(bestSum, loc);
    });
    mod.defoverload("plus", [ThingType.string, ThingType.string], (loc, argv) => {
        const x = argv[0].v +  argv[1].v;
        return boxString(x, loc, JSON.stringify(x), "");
    });
}

/*

export const OPERATORS: Record<string, Operator> = {
    // attribute sigil
    "#!": op(INVALID, -Infinity),
    // symbol name
    ".": op(INVALID, -Infinity),
    // interpolate and bitwise AND
    "&": op(6, 0).code((a, b) => a & b),
    // length or as 0-ary pipeline placeholder (that is handled specially)
    "#": op(INVALID, 0).code(null, a => a.length),
    // boolean NOT
    "!": op(INVALID, 0).code(null, a => !a),
    // power
    "**": op(1, INVALID, true).code((a, b) => a ** b),
    // multiply or splat operator
    "*": op(3, -Infinity).code((a, b) => a * b),
    // divide & modulo
    "/": op(3).code((a, b) => a / b),
    "%": op(3).code((a, b) => a % b),
    // matrix multiply
    // or decorator to mark param or declaration as lazy/macro
    "@": op(3, -Infinity),
    // add
    "+": op(4).code((a, b) => a + b),
    // subtract, negate
    "-": op(4, 2).code((a, b) => a - b, a => -a),
    // boolean OR / AND
    "||": op(5).code((a, b) => a || b),
    "&&": op(5).code((a, b) => a && b),
    // bit shifting (before other bitwise to match C)
    ">>": op(5.9).code((a, b) => a >> b),
    "<<": op(5.9).code((a, b) => a << b),
    // bitwise OR / XOR
    "|": op(6).code((a, b) => a | b),
    "^": op(6).code((a, b) => a ^ b),
    // comparison
    "==": op(7).code((a, b) => a == b),
    ">=": op(7).code((a, b) => a >= b),
    ">": op(7).code((a, b) => a > b),
    "<=": op(7).code((a, b) => a <= b),
    "<": op(7).code((a, b) => a < b),
    "!=": op(7).code((a, b) => a != b),
    // indexing
    "->": op(8).code((a, b) => a[b]),
    // pipe
    "|>": op(9),
    // conditional in 2 parts (treated as binary and postprocessed for simplicity)
    // colon is also used for keyword arguments
    ":": op(10, INVALID, true),
    "?": op(11, INVALID, true),
    // assignment operator (no overloads and handles specially, just here so it can be parsed in the right spot)
    "=": op(12),
    // mapping operator (for inside lists)
    "=>": op(13),
    // define operator (handled specially)
    ":-": op(13),
    // statement separator
    ",": op(14).code((_, b) => b),
    ";": op(14),
};

*/
