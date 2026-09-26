import { isString } from "lib0/function";

export class Parselet {
    /**
     * It always has the sticky (y) flag.
     */
    readonly prefix: RegExp;
    /**
     * This is a JEB callable (builtin, lambda, etc) of one argument that implements the parse
     * handler of the parselet.
     *
     * For a prefix position, context.left is undefined, and context.first is true.
     *
     * For an infix position, context.left is the left-side expression, and context.first is false.
     *
     * In either case the parse function must return a chunk of JEB code that implements the
     * parse result, call `context.skip()` to mark what it has parsed as insignificant (`skip`
     * is a continuation which doesn't return), or call `context.discard()`
     * which goes to the next token.
     */
    readonly parse: any;
    /**
     * True for parselets that can only appear in infix position, such as
     * binary operators. The implicit-call machinery uses this to tell
     * `1 + 2` (operator) apart from `f x` (call) without each operator
     * needing its own leading-whitespace handling.
     */
    readonly infixOnly: boolean;
    constructor(prefix: RegExp | string, parse: any, infixOnly = false) {
        this.prefix = forceStickyRegex(prefix);
        this.parse = parse;
        this.infixOnly = infixOnly;
    }
}

export const forceStickyRegex = (s: string | RegExp) => isString(s) ? new RegExp(RegExp.escape(s), "y") : s.sticky ? s : new RegExp(s, s.flags + "y");
