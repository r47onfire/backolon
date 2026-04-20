import { type LocationTrace, RuntimeError, UNKNOWN_LOCATION } from "../errors";
import { type Pattern } from "../patterns/internals";
import { type StackEntry } from "../runtime/task";
import { javaHash, rotate32 } from "../utils";

export enum ThingType {
    /**
     * The empty value.
     */
    nil,
    /**
     * Represents the end-of-file marker for tokenization.
     */
    done,
    /**
     * An alphanumeric symbol, such as `x`, `hello`, or `_QWE_RTY_123`.
     */
    name,
    /**
     * An operator character, such as `+`, `@`, or `$`, but never multiple characters
     * like `+=` or `|>`.
     */
    operator,
    /**
     * A symbol composed entirely of whitespace (excluding newlines) and/or comments.
     */
    space,
    /**
     * A symbol composed of entirely newlines.
     */
    newline,
    /**
     * JS number or bigint.
     */
    number,
    /**
     * Literal, or part of an interpolation block.
     */
    string,
    /**
     * A block of code enclosed in `(...)`.
     */
    roundblock,
    /**
     * A block of code enclosed in `[...]`.
     */
    squareblock,
    /**
     * A block of code enclosed in `{...}`.
     */
    curlyblock,
    /**
     * A block of code represented as written at the top-level of a file.
     */
    topblock,
    /**
     * A string with interpolations, the literal bits are {@link string} children,
     * and the interpolated blocks are included as {@link roundblock} blocks
     * (even though they're written as `{...}`).
     */
    stringblock,
    /**
     * Represents an unevaluated function call, `.c[0]` is the function, `.c[1:]`
     * are the code blocks that evaluate to the arguments.
     */
    apply,
    /**
     * A closed-over lambda function or macro, `.c[0]` is the call signature,
     * `.c[1]` is the body.
     */
    func,
    /**
     * A named javascript function or macro. The value is only the string name
     * that it's stored under in the {@link Scheduler}, so as to allow the
     * state to be serialized (since JSON can't serialize functions).
     */
    nativefunc,
    /**
     * An implicit block (what a function gets if it declares a parameter as
     * `@lazy`), `.v` is the closed-over {@link env}, `.c[0]` is the actual body.
     */
    implicitfunc,
    /**
     * An entry in a parameter list of a function (e.g. `.c[0]` of a
     * {@link func}); the children are the name {@link name}, allowed
     * types {@link list}, and the default value if it's optional.
     * The value is a 3-tuple of booleans `[lazy, splat, mustUnpack]`.
     */
    paramdescriptor,
    /**
     * Represents a continuation. The value is a copy of the {@link Task#stack stack}
     * at the point at which it was captured, and invoking the continuation restores
     * the stack.
     */
    continuation,
    /**
     * Represents a parsed pattern, for pattern-matching. The value is
     * a {@link Pattern}.
     */
    pattern,
    /**
     * A list of values. This is **NOT** a list literal - those are a {@link squareblock}
     * and processed by the builtin patterns.
     */
    list,
    /**
     * A mapping of keys to values. The children are {@link pair}. This is **NOT** a
     * map literal - those are a {@link squareblock} and processed by the builtin patterns.
     */
    map,
    /**
     * A key-value pair in a {@link map}. The hash value of this is ignored, since maps are
     * keyed on the key's hash.
     */
    pair,
    /**
     * An entry of a pattern-matching pattern in the environment's patterns list.
     * The children are the {@link pattern} itself, the callable handler that processes
     * the match, a {@link list} of types specifying which blocks the pattern applies in,
     * and a {@link number} specifying the precedence of the pattern (for sorting, when
     * defining a new pattern).
     */
    pattern_entry,
    /**
     * Represents an environment that variables and patterns can be stored in.
     * The children are a {@link list} of parent envs or {@link nil} if there's no parent,
     * a {@link map} of the variables, and a {@link list} of {@link pattern_entry}.
     */
    env,
    /**
     * Returned by a function to signal its result is a macro body, and should be evaluated again.
     */
    macroized,
    /**
     * Represents a function that should have its return value spliced into the callee's arguments list.
     */
    splat,
    /**
     * Represents a "generalized lvalue" that can be assigned to. The children are 2 functions that can be
     * called to get or set the value that this reference refers to.
     */
    reference,
}

type ThingInternalTypes<T extends ThingType> = {
    [ThingType.nil]: [null, []],
    [ThingType.done]: [null, []],
    [ThingType.name]: [string, []],
    [ThingType.operator]: [string, []],
    [ThingType.space]: [string, []],
    [ThingType.newline]: [string, []],
    [ThingType.number]: [number | bigint, []],
    [ThingType.string]: [string, []],
    [ThingType.roundblock]: [null, readonly Thing[]],
    [ThingType.squareblock]: [null, readonly Thing[]],
    [ThingType.curlyblock]: [null, readonly Thing[]],
    [ThingType.topblock]: [null, readonly Thing[]],
    [ThingType.stringblock]: [null, readonly Thing<ThingType.string | ThingType.roundblock>[]],
    [ThingType.apply]: [significant: boolean, readonly Thing[]],
    [ThingType.func]: [name: string | null, readonly [signature: Thing<ThingType.squareblock>, body: Thing]],
    [ThingType.nativefunc]: [string, []],
    [ThingType.implicitfunc]: [Thing<ThingType.env> | Thing<ThingType.nil>, readonly [body: Thing]],
    [ThingType.paramdescriptor]: [[isLazy: boolean, isSplat: boolean, mustUnpack: boolean], readonly [name: Thing<ThingType.name>] | readonly [name: Thing<ThingType.name>, types: Thing<ThingType.list>] | readonly [name: Thing<ThingType.name>, types: Thing<ThingType.list>, defaultValue: Thing]],
    [ThingType.continuation]: [readonly StackEntry[], []],
    [ThingType.pattern]: [Pattern, readonly Thing[]],
    [ThingType.list]: [null, Thing[]],
    [ThingType.map]: [null, Thing<ThingType.pair>[]],
    [ThingType.pair]: [null, [Thing, Thing]],
    [ThingType.pattern_entry]: [isRightAssociative: boolean, readonly [pattern: Thing<ThingType.pattern>, handler: Thing, when: Thing<ThingType.list>, precedence: Thing<ThingType.number>]],
    [ThingType.env]: [null, readonly [parents: Thing<ThingType.list>, vars: Thing<ThingType.map>, patterns: Thing<ThingType.list>]]
    [ThingType.macroized]: [null, readonly [Thing]],
    [ThingType.splat]: [null, readonly Thing[]],
    [ThingType.reference]: [null, readonly [get: Thing, set: Thing]]
}[T];

const unhashable = [ThingType.list, ThingType.map, ThingType.env];
type ValueType<T extends ThingType> = ThingInternalTypes<T>[0];
type ChildrenType<T extends ThingType> = ThingInternalTypes<T>[1];

/**
 * Every object in Backolon is wrapped or implemented by this class.
 */
export class Thing<T extends (ThingType | string) = ThingType | string> {
    /** Null if this or any child is not hashable. */
    public readonly h: number | null = null;
    constructor(
        /** type */
        public readonly t: T,
        /** children */
        public readonly c: T extends ThingType ? ChildrenType<T> : Thing[],
        /** value */
        public v: T extends ThingType ? ValueType<T> : any,
        /** source prefix */
        public readonly s0: string,
        /** source suffix */
        public readonly s1: string,
        /** source joiner */
        public readonly sj: string,
        /** source location */
        public readonly loc: LocationTrace,
        hashable: boolean = typeof t === "number" && !unhashable.includes(t as ThingType),
        valueInHash: boolean = true,
    ) {
        if (!hashable) return;
        var hash = javaHash((t as number).toString(16));
        for (var child of c) {
            if (child.h === null) return;
            hash ^= rotate32(hash ^ 0xabcdef01, 30) + child.h;
        }
        hash ^= rotate32(hash ^ 0x31415926, 7) + (valueInHash ? javaHash(String(v)) : 0);
        this.h = hash;
    }
}

export function boxNil(trace = UNKNOWN_LOCATION, str = "nil") { return new Thing(ThingType.nil, [], null, str, "", "", trace); }
export function boxEnd(trace = UNKNOWN_LOCATION) { return new Thing(ThingType.done, [], null, "", "", "", trace); }
export function boxSymbol<T extends ThingType.name | ThingType.operator | ThingType.space>(value: string, kind: T, trace = UNKNOWN_LOCATION): Thing<T> { return new Thing(kind, [] as any, value as any, value, "", "", trace); }
export function boxNameSymbol(value: string, trace = UNKNOWN_LOCATION) { return boxSymbol(value, ThingType.name, trace); }
export function boxOperatorSymbol(value: string, trace = UNKNOWN_LOCATION) { return boxSymbol(value, ThingType.operator, trace); }
export function boxSpaceSymbol(value: string, trace = UNKNOWN_LOCATION) { return boxSymbol(value, ThingType.space, trace); }
export function boxNumber(value: number | bigint, trace = UNKNOWN_LOCATION, repr = value.toString().replace(/n$/, "")) { return new Thing(ThingType.number, [], value, repr, "", "", trace); }
export function boxBoolean(value: boolean, trace = UNKNOWN_LOCATION, repr = value.toString()) { return new Thing(ThingType.number, [], +value, repr, "", "", trace); }
export function boxString(value: string, trace = UNKNOWN_LOCATION, raw: string, quote: string) { return new Thing(ThingType.string, [], value, quote + raw, quote, "", trace); }
export function boxBlock<T extends ThingType.roundblock | ThingType.squareblock | ThingType.curlyblock | ThingType.stringblock | ThingType.topblock>(children: Thing<T>["c"], kind: T, trace = UNKNOWN_LOCATION, start: string, end: string, join = ""): Thing<T> { return new Thing(kind, children, null as any, start, end, join, trace); }
export function boxRoundBlock(children: readonly Thing[], trace = UNKNOWN_LOCATION) { return boxBlock(children, ThingType.roundblock, trace, "(", ")"); }
export function boxSquareBlock(children: readonly Thing[], trace = UNKNOWN_LOCATION, join = "") { return boxBlock(children, ThingType.squareblock, trace, "[", "]", join); }
export function boxCurlyBlock(children: readonly Thing[], trace = UNKNOWN_LOCATION) { return boxBlock(children, ThingType.curlyblock, trace, "{", "}"); }
export function boxToplevelBlock(children: readonly Thing[], trace = UNKNOWN_LOCATION) { return boxBlock(children, ThingType.topblock, trace, "", ""); }
export function boxStringBlock(children: Thing<ThingType.string | ThingType.roundblock>[], trace = UNKNOWN_LOCATION, quote: string) { return boxBlock(children, ThingType.stringblock, trace, quote, quote); }
export function boxList(items: Thing[], trace = UNKNOWN_LOCATION, start = "[", end = "]", join = ", ") { return new Thing(ThingType.list, items, null, start, end, join, trace, false); }
export function boxNativeFunc(name: string, trace = UNKNOWN_LOCATION) { return new Thing(ThingType.nativefunc, [], name, `<built-in ${name}>`, "", "", trace); }
export function boxApply(func: Thing, args: readonly Thing[], trace = UNKNOWN_LOCATION, start = "(", end = ")", significant = false) { return new Thing(ThingType.apply, [func, ...args], significant, start, end, " ", trace); }


// hack to make it one per Thing
export type OneTypeThing<T extends (ThingType | string)> = T extends any ? Thing<T> : never;
/**
 * Return a helper function that returns true if the given Thing is any of the given types.
 * 
 * @example
 * ```js
 * if (typecheck(ThingType.number, ThingType.string)(object)) {
 *     // inside this block, object is known to be
 *     // Thing<ThingType.number> | Thing<ThingType.string>
 * }
 * ```
 */
export function typecheck<T extends (ThingType | string)>(...types: T[]) {
    return (thing: Thing<any>): thing is OneTypeThing<T> => types.includes(thing.t as T);
}

export const isBlock = typecheck(ThingType.roundblock, ThingType.squareblock, ThingType.curlyblock, ThingType.stringblock, ThingType.topblock);
export const isSymbol = typecheck(ThingType.name, ThingType.operator, ThingType.space);
export const isCallable = typecheck(ThingType.func, ThingType.nativefunc, ThingType.implicitfunc, ThingType.continuation);
export const isAtom = typecheck(ThingType.nil, ThingType.done, ThingType.name, ThingType.operator, ThingType.number, ThingType.string, ThingType.func, ThingType.implicitfunc, ThingType.nativefunc, ThingType.continuation, ThingType.list, ThingType.map, ThingType.splat, ThingType.macroized);

export type CheckedType<T extends (thing: Thing<any>) => thing is Thing<any>> = T extends (thing: Thing<any>) => thing is Thing<infer U> ? U : never;

// Why does this exist
export function extractSymbolName(thing: Thing): string {
    if (!isSymbol(thing)) {
        throw new RuntimeError("Expected symbol", thing.loc);
    }
    return thing.v;
}

/**
 * Returns the human-readable name of a ThingType, or returns the string itself if it's not a ThingType.
 */
export const typeNameOf = (type: ThingType | string): string => (ThingType[type as any] ?? type) as string;
