import { type LocationTrace, RuntimeError, UNKNOWN_LOCATION } from "../errors";
import { type Pattern } from "../patterns/internals";
import { type StackEntry } from "../runtime/task";
import { javaHash, rotate32 } from "../utils";

export enum ThingType {
    /** the empty value */
    nil,
    /** represents the end-of-file marker for tokenization, or the end of a read stream, or the end of an iterable */
    end,
    /** an alphanumeric symbol, such as x, hello, or _QWE_RTY_123 */
    name,
    /** an operator character (only ever one character) */
    operator,
    /** a symbol composed entirely of whitespace and/or comments. Newlines get their own Thing. */
    space,
    newline,
    number,
    string,
    roundblock,
    squareblock,
    curlyblock,
    topblock,
    stringblock,
    /** represents a function call, children[0] is the function, children[1:] are the arguments */
    apply,
    /** closed-over lambda function or macro, children[0] is the call signature, children[1] is the body */
    func,
    /** javascript function or macro, children is empty, value is the native function details */
    nativefunc,
    /** implicit block, value=env, children[0] is the body */
    implicitfunc,
    /** name, type, default; value=lazy */
    paramdescriptor,
    continuation,
    /** children[0] is the bind target object (the "self" value), children[1] is the method */
    boundmethod,
    /** pattern program in data, child nodes are just for reconstruction */
    pattern,
    list,
    map,
    pair,
    pattern_entry,
    /** triple (parent or nil, vars, patterns); patterns is list of (pattern, when, implementation) */
    env,
    macroized,
    splat,
}

type ThingInternalTypes<T extends ThingType> = {
    [ThingType.nil]: [null, []],
    [ThingType.end]: [null, []],
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
    [ThingType.func]: [name: string | null, readonly [Thing<ThingType.squareblock>, Thing]],
    [ThingType.nativefunc]: [string, []],
    [ThingType.implicitfunc]: [Thing<ThingType.env> | Thing<ThingType.nil>, readonly [Thing]],
    [ThingType.paramdescriptor]: [[isLazy: boolean, isSplat: boolean, mustUnpack: boolean], readonly [Thing<ThingType.name>] | readonly [Thing<ThingType.name>, Thing<ThingType.list>] | readonly [Thing<ThingType.name>, Thing<ThingType.list>, Thing]],
    [ThingType.continuation]: [readonly StackEntry[], []],
    [ThingType.boundmethod]: [null, readonly [Thing, Thing<ThingType.func>]],
    [ThingType.pattern]: [Pattern, readonly Thing[]],
    [ThingType.list]: [null, Thing[]],
    [ThingType.map]: [null, Thing<ThingType.pair>[]],
    [ThingType.pair]: [null, [Thing, Thing]],
    [ThingType.pattern_entry]: [isRightAssociative: boolean, readonly [pattern: Thing<ThingType.pattern>, handler: Thing, when: Thing<ThingType.list>, precedence: Thing<ThingType.number>]],
    [ThingType.env]: [null, readonly [parents: Thing<ThingType.list>, vars: Thing<ThingType.map>, patterns: Thing<ThingType.list>]]
    [ThingType.macroized]: [null, readonly [Thing]],
    [ThingType.splat]: [null, readonly Thing[]],
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
export function boxEnd(trace = UNKNOWN_LOCATION) { return new Thing(ThingType.end, [], null, "", "", "", trace); }
export function boxSymbol<T extends ThingType.name | ThingType.operator | ThingType.space>(value: string, kind: T, trace = UNKNOWN_LOCATION): Thing<T> { return new Thing(kind, [] as any, value as any, value, "", "", trace); }
export function boxNameSymbol(value: string, trace = UNKNOWN_LOCATION) { return boxSymbol(value, ThingType.name, trace); }
export function boxOperatorSymbol(value: string, trace = UNKNOWN_LOCATION) { return boxSymbol(value, ThingType.operator, trace); }
export function boxSpaceSymbol(value: string, trace = UNKNOWN_LOCATION) { return boxSymbol(value, ThingType.space, trace); }
export function boxNumber(value: number | bigint, trace = UNKNOWN_LOCATION, repr = value.toString().replace("n", "")) { return new Thing(ThingType.number, [], value, repr, "", "", trace); }
export function boxString(value: string, trace = UNKNOWN_LOCATION, raw: string, quote: string) { return new Thing(ThingType.string, [], value, quote + raw, quote, "", trace); }
export function boxBlock<T extends ThingType.roundblock | ThingType.squareblock | ThingType.curlyblock | ThingType.stringblock | ThingType.topblock>(children: Thing<T>["c"], kind: T, trace = UNKNOWN_LOCATION, start: string, end: string): Thing<T> { return new Thing(kind, children, null as any, start, end, "", trace); }
export function boxRoundBlock(children: readonly Thing[], trace = UNKNOWN_LOCATION) { return boxBlock(children, ThingType.roundblock, trace, "(", ")"); }
export function boxSquareBlock(children: readonly Thing[], trace = UNKNOWN_LOCATION) { return boxBlock(children, ThingType.squareblock, trace, "[", "]"); }
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
export const isCallable = typecheck(ThingType.func, ThingType.nativefunc, ThingType.implicitfunc, ThingType.continuation, ThingType.boundmethod);
export const isPattern = typecheck(ThingType.pattern);
export const isAtom = typecheck(ThingType.nil, ThingType.end, ThingType.name, ThingType.operator, ThingType.number, ThingType.string, ThingType.func, ThingType.boundmethod, ThingType.implicitfunc, ThingType.nativefunc, ThingType.continuation, ThingType.list, ThingType.map, ThingType.splat, ThingType.macroized);

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
