import { ErrorNote, LocationTrace, ParseError, RuntimeError, UNKNOWN_LOCATION } from "../errors";
import { boxBlock, boxString, boxStringBlock, isBlock, isSymbol, Thing, ThingType } from "../objects/thing";
import { blockParse, BlockRule } from "./blockParse";
import { tokenize } from "./tokenizer";
import { DEFAULT_UNPARSER } from "./unparse";

/**
 * @file
 * @module Builtins
 */

export enum BlockHandler {
    round = "r",
    square = "s",
    curly = "c",
    string = "t",
    rawstring = "a",
    stringInterpolation = "i",
    comment = "m",
    lineComment = "l",
    toplevel = "o",
}

const baseBlocks = {
    "(": BlockHandler.round,
    "[": BlockHandler.square,
    "{": BlockHandler.curly,
    '"': BlockHandler.string,
    "'": BlockHandler.rawstring,
    "##": BlockHandler.comment,
    "# ": BlockHandler.lineComment,
}
const bannedInners = [")", "]", "}"];

function makeBlock(this: BlockRule, items: Thing[], start: string, end: string, loc: LocationTrace) {
    return boxBlock(items, this.t, loc, start, end);
}

function makeComment(items: Thing[], start: string, end: string, loc: LocationTrace) {
    return new Thing(ThingType.space, [], start, start + items.map(i => DEFAULT_UNPARSER.unparse(i)).join(""), end, "", loc);
}

const defaultBlockRules: Record<BlockHandler, BlockRule> = {
    [BlockHandler.toplevel]: {
        t: ThingType.topblock,
        e: [null],
        x: [],
        i: baseBlocks,
        p: makeBlock,
        b: bannedInners,
    },
    [BlockHandler.round]: {
        t: ThingType.roundblock,
        e: [")"],
        x: [],
        i: baseBlocks,
        p: makeBlock,
        b: bannedInners,
    },
    [BlockHandler.square]: {
        t: ThingType.squareblock,
        e: ["]"],
        x: [],
        i: baseBlocks,
        p: makeBlock,
        b: bannedInners,
    },
    [BlockHandler.curly]: {
        t: ThingType.curlyblock,
        e: ["}"],
        x: [],
        i: baseBlocks,
        p: makeBlock,
        b: bannedInners,
    },
    /**
     * Raw string without escapes or interpolations processed
     * @backolon
     * @category Strings
     * @syntax Raw String
     * @pattern 'text {text} text \text'
     */
    [BlockHandler.rawstring]: {
        t: ThingType.stringblock,
        e: ["'"],
        x: ["\\'", "\\\\"],
        i: {},
        p(items, start, end, loc) {
            if (end !== start) throw new ParseError("unreachable", loc);
            const raw = items.map(item => DEFAULT_UNPARSER.unparse(item)).join("");
            return boxString(raw.replaceAll(/\\(['\\])/g, "$1"), loc, raw, start);
        },
        b: []
    },
    /**
     * Double-quoted strings with interpolation and escapes
     * @backolon
     * @category Strings
     * @syntax Normal String
     * @pattern "text {expression} \u{1F34}"
     * @example
     * ```backolon
     * x := 0x123
     * # objects that have been processed use the default stringification method
     * "hello, {x + 0}" # => "hello, 291"
     * # objects that have not been processed remember how they were originally written
     * "hello, {x}" # => "hello, 0x123"
     * ```
     */
    [BlockHandler.string]: {
        t: ThingType.stringblock,
        e: ['"'],
        x: ['\\"', "\\\\", "\\{"],
        i: { "{": BlockHandler.stringInterpolation, },
        p(items, start, end, loc) {
            var curString = "", curStringRaw = "", startLoc: LocationTrace | null = loc;
            const bits: Thing<ThingType.string | ThingType.roundblock>[] = [];
            const chuck = () => {
                bits.push(boxString(curString, startLoc!, curStringRaw, ""));
                curString = curStringRaw = "";
                startLoc = null;
            }
            for (var i = 0; i < items.length; i++) {
                const item = items[i]!;
                startLoc ??= item.loc;
                if (isBlock(item)) {
                    if (item.c.length === 0) {
                        throw new RuntimeError("empty interpolation block", item.loc);
                    }
                    chuck();
                    bits.push(item as Thing<ThingType.roundblock>);
                    continue;
                }
                if (item.v === "\\") {
                    // Process escape characters
                    const next = items[++i];
                    if (!next) throw new ParseError("unreachable (backslash at end of string)", item.loc);
                    if (/^['"{}]$/.test(next.v as string)) {
                        curStringRaw += "\\" + next.v;
                        curString += next.v;
                    } else if (isSymbol(next)) {
                        const escPortion = unescape(next.v, next.loc, false);
                        if (escPortion.length === 0) {
                            const curlyblock = items[++i];
                            if (!curlyblock || !isBlock(curlyblock)) {
                                throw new ParseError(`expected \"{\" after \"\\${next.v}\"`, (curlyblock ?? next).loc,
                                    [new ErrorNote("note: use ' instead of \" to make this a raw string", loc)]);
                            }
                            const fullEscape = "u" + DEFAULT_UNPARSER.unparse(curlyblock);
                            curStringRaw += "\\" + fullEscape;
                            curString += unescape(fullEscape, curlyblock.loc, true);
                        } else {
                            curStringRaw += "\\" + next.v;
                            curString += escPortion;
                        }
                    } else throw new ParseError("invalid escape", next.loc);
                } else {
                    curStringRaw += item.v;
                    curString += item.v;
                }
            }
            if (curStringRaw.length !== 0) chuck();
            return bits.length === 1 ? bits[0]! : boxStringBlock(bits, loc, start);
        },
        b: []
    },
    [BlockHandler.stringInterpolation]: {
        t: ThingType.roundblock,
        e: ["}"],
        x: [],
        i: baseBlocks,
        p: makeBlock,
        b: bannedInners,
    },
    [BlockHandler.comment]: {
        t: ThingType.roundblock,
        e: ["##"],
        x: [],
        i: {},
        p: makeComment,
        b: [],
    },
    [BlockHandler.lineComment]: {
        t: ThingType.roundblock,
        e: ["\n", null],
        g: false,
        x: [],
        i: {},
        p: makeComment,
        b: []
    }
}


// string string string
function unescape(string: string, src: LocationTrace, variable: boolean): string {
    if (variable) {
        if (!/^u\{[a-f0-9]+\}$/i.test(string)) throw new ParseError("invalid escape sequence", src);
        return hexEsc(string, src);
    } else if (/^u$/i.test(string)) return "";
    const escapeLen = {
        a: 1, b: 1, e: 1, f: 1, n: 1, r: 1, t: 1, v: 1, z: 1, '"': 1, "'": 1, "\\": 1,
        x: 3, u: 5
    }[string[0]!];
    if (!escapeLen) throw new ParseError("unknown escaped character", src);
    const afterPortion = string.slice(escapeLen);
    string = string.slice(0, escapeLen);
    if (string.length < escapeLen || !/^.[a-f0-9]*$/i.test(string)) throw new ParseError("invalid escape sequence", src);
    return ({
        a: "\a", b: "\b", e: "\e", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", z: "\0", "'": "'", "\"": "\"", "\\": "\\",
        x: false as const,
        u: false as const
    }[string.toLowerCase()[0]!] || hexEsc(string, src)) + afterPortion;
}

function hexEsc(string: string, src: LocationTrace): string {
    try {
        return String.fromCodePoint(parseInt(/[0-9a-f]+/i.exec(string)![0], 16));
    } catch (e: any) {
        if (e instanceof RangeError) {
            const e2 = new ParseError("escape out of range", src);
            e2.cause = e;
            throw e2;
        }
    }
    throw new ParseError("unreachable", src);
}

/**
 * Parse Backolon source text into a syntax tree of Thing objects, but do not apply any patterns.
 */
export function parse(string: string, filename: URL = UNKNOWN_LOCATION.file) {
    return blockParse(tokenize(string, filename), defaultBlockRules, BlockHandler.toplevel);
}
