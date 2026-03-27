import { last } from "lib0/array";
import { id } from "lib0/function";
import { LocationTrace, ParseError, UNKNOWN_LOCATION } from "../errors";
import { boxEnd, Thing, ThingType } from "../objects/thing";

const pNumber = (x: string) => {
    try {
        const big = BigInt(x);
        if (big > Number.MAX_SAFE_INTEGER || big < Number.MIN_SAFE_INTEGER) return big;
    } catch {
    }
    return Number(x);
}

type Rule = [
    RegExp,
    ThingType,
    process: (x: string) => any
];
const TOKENIZE_RULES: Rule[] = [
    [/^0x[a-f0-9]+|^-?0b[01]+/i, ThingType.number, pNumber],
    [/^(\.\d+|\d+\.?\d*)(e[+-]?\d+)?/i, ThingType.number, pNumber],
    [/^[\p{Alpha}_][\p{Alpha}\p{Number}_]*/u, ThingType.name, id],
    [/^\p{Punctuation}/u, ThingType.operator, id],
    [/^((?!\n)\s)+/, ThingType.space, id],
    [/^\n(\s+\n)?/, ThingType.newline, id],
    [/^./, ThingType.operator, id]
];

export function tokenize(source: string, filename: URL = UNKNOWN_LOCATION.file) {
    var line = 0, col = 0;
    const out: Thing[] = [];
    tokens: while (source.length > 0) {
        for (var [regex, type, process] of TOKENIZE_RULES) {
            const match = regex.exec(source);
            if (match) {
                const chunk = match[0];
                out.push(new Thing(type, [], process(match[0]), match[0], "", "", new LocationTrace(line, col, filename)));
                const interlines = chunk.split("\n");
                if (interlines.length > 1) {
                    col = last(interlines)!.length;
                    line += interlines.length - 1;
                } else {
                    col += chunk.length;
                }
                source = source.slice(chunk.length);
                continue tokens;
            }
        }
        // the last rule should always match, we should never get here
        throw new ParseError("unreachable", new LocationTrace(line, col, filename));
    }
    out.push(boxEnd(new LocationTrace(line, col, filename)) as any);
    return out;
}
