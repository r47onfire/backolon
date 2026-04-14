import { NativeModule, rewriteAsApply, symbol_x, symbol_y } from "./module";
import { LocationTrace } from "../errors";
import { boxNumber, Thing, ThingType } from "../objects/thing";

/**
 * @file
 * @module Builtins
 */

const b = BigInt, n = Number, i = (x: number) => n.isInteger(x) && n.isSafeInteger(x);

type BinaryFun = (x: any, y: any) => any;

const number_op = (cb: BinaryFun) => (loc: LocationTrace, argv: [Thing<ThingType.number>, Thing<ThingType.number>]) => {
    // Why is doing math on two bigints / numbers so complicated
    const x = argv[0].v, y = argv[1].v;
    const bigX = typeof x === "bigint", bigY = typeof y === "bigint";
    var result: number | bigint = 0;
    if (bigX && bigY) {
        // TODO: this will still perform integer division, we need to downcast *first* if it's division...
        const nResult = n(result = cb(x, y));
        if (b(nResult) === result) result = nResult;
    }
    else if (!bigX && !bigY) {
        const naive = cb(x, y)
        result = !n.isInteger(naive) || n.isSafeInteger(naive) ? naive : cb(b(x), b(y));
    }
    else if (bigX && !bigY) {
        // x is big, y is not
        result = i(y) ? cb(x, b(y)) : cb(n(x), y);
    }
    else if (!bigX && bigY) {
        // y is big, x is not
        result = i(x) ? cb(b(x), y) : cb(x, n(y));
    }
    return boxNumber(result, loc);
}

export function math(mod: NativeModule) {
    const xy = [symbol_x, symbol_y];
    const x = [symbol_x];

    const operation = (name: string, operator?: string, precedence?: number, right?: boolean, implementation?: BinaryFun) => {
        mod.defop(`__${name}`, name);
        if (implementation) {
            mod.defsyntax(`x ${operator} y`, precedence!, right!, null, `__rewrite_${name}`, rewriteAsApply(xy, `__${name}`));
            mod.defoverload(name, [ThingType.number, ThingType.number], number_op(implementation));
        }
    };
    const unary = (name: string, operator: string, precedence: number, right: boolean, impl: (x: number) => number) => {
        mod.defsyntax(`[^] ${operator} x`, precedence, right, null, `__rewrite_unary_${name}`, rewriteAsApply(x, `__${name}`));
        mod.defoverload(name, [ThingType.number], (loc, argv) => boxNumber(impl(argv[0].v as number), loc));
    };

    operation("not");
    /**
     * @syntax Logical NOT
     * @backolon
     * @category Operators
     * @pattern (!any)
     */
    unary("not", "!", 0, true, x => x ? 0 : 1);

    /**
     * @syntax Exponentiation
     * @backolon
     * @category Operators
     * @pattern number ** number
     */
    operation("pow", "**", 1, true, (x, y) => x ** y);
    /**
     * @syntax Multiplication
     * @backolon
     * @category Operators
     * @pattern number * number
     */
    operation("mul", "*", 3, false, (x, y) => x * y);
    /**
     * @syntax Division
     * @backolon
     * @category Operators
     * @pattern number / number
     */
    operation("div", "/", 3, false, (x, y) => x / y);
    /**
     * @syntax Modulo
     * @backolon
     * @category Operators
     * @pattern number % number
     */
    operation("mod", "%", 3, false, (x, y) => x % y);

    /**
     * @syntax Add
     * @backolon
     * @category Operators
     * @pattern number + number
     */
    operation("add", "+", 4, false, (x, y) => x + y);

    /**
     * @syntax Subtract
     * @backolon
     * @category Operators
     * @pattern number - number
     */
    operation("sub", "-", 4, false, (x, y) => x - y);
    /**
     * Only valid at start of expression!
     * @syntax Unary negation
     * @backolon
     * @category Operators
     * @pattern (-number)
     */
    unary("sub", "-", 2, true, x => -x);

    // TODO: make these short-circuit
    /**
     * @syntax Logical OR
     * @backolon
     * @category Operators
     * @pattern any || any
     */
    operation("bool_or", "||", 5, false, (x, y) => x || y);
    /**
     * @syntax Logical AND
     * @backolon
     * @category Operators
     * @pattern any && any
     */
    operation("bool_and", "&&", 5, false, (x, y) => x && y);

    /**
     * @syntax Bitwise Left Shift
     * @backolon
     * @category Operators
     * @pattern number << number
     */
    operation("shl", "<<", 5.9, false, (x, y) => x << y);
    /**
     * @syntax Bitwise Right Shift
     * @backolon
     * @category Operators
     * @pattern number >> number
     */
    operation("shr", ">>", 5.9, false, (x, y) => x >> y);

    /**
     * @syntax Bitwise OR
     * @backolon
     * @category Operators
     * @pattern number | number
     */
    operation("bit_or", "|", 6, false, (x, y) => x | y);
    /**
     * @syntax Bitwise AND
     * @backolon
     * @category Operators
     * @pattern number & number
     */
    operation("bit_and", "&", 6, false, (x, y) => x & y);
    /**
     * @syntax Bitwise XOR
     * @backolon
     * @category Operators
     * @pattern number ^ number
     */
    operation("bit_xor", "^", 6, false, (x, y) => x ^ y);

    // TODO: generalize equality operators
    /**
     * @syntax Equality
     * @backolon
     * @category Operators
     * @pattern number == number
     */
    operation("eqeq", "==", 7, false, (x, y) => x == y);
    /**
     * @syntax Inequality
     * @backolon
     * @category Operators
     * @pattern number != number
     */
    operation("noteq", "!=", 7, false, (x, y) => x != y);
    /**
     * @syntax Greater than
     * @backolon
     * @category Operators
     * @pattern number > number
     */
    operation("gt", ">", 7, false, (x, y) => x > y);
    /**
     * @syntax Less than
     * @backolon
     * @category Operators
     * @pattern number < number
     */
    operation("lt", "<", 7, false, (x, y) => x < y);
    /**
     * @syntax Greater than or equal
     * @backolon
     * @category Operators
     * @pattern number >= number
     */
    operation("gte", ">=", 6.9, false, (x, y) => x >= y);
    /**
     * @syntax Less than or equal
     * @backolon
     * @category Operators
     * @pattern number <= number
     */
    operation("lte", "<=", 6.9, false, (x, y) => x <= y);
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
