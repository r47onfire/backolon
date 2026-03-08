import { map } from "lib0/object";
import { Thing, ThingType } from "../objects/thing";
import { compile, PatternProgram } from "./compile";
import { NFASubstate } from "./internals";


export class MatchResult {
    constructor(
        public bindings: [Thing<ThingType.name>, Thing[] | Thing][],
        public span: [number, number]
    ) { }
}

/**
 * Finds all of the matches of the pattern and returns (for each match) the bindings
 * and the span.
 *
 * Uses a tree-walking version of Thompson's NFA construction internally, for speed.
 *
 * @param source Stream of tokens to be fed to the pattern matching.
 * @param patterns List of structured trees of `pattern`-type Things describing the patterns to be matched against.
 * @param findAll Whether to find all matches, if true, or stop early when the leftmost match is found, if false. (Default true)
 */

export function matchPattern(source: readonly Thing[], pattern: Thing<ThingType.pattern>, findAll = true): MatchResult[] {
    const queue: (NFASubstate | MatchResult)[] = [];
    const program: PatternProgram = compile(pattern);
    const addIfNotAlreadySeen = (item: NFASubstate, hashSet: Record<number, true>, i: number) => {
        if (hashSet[item.h]) return;
        hashSet[item.h] = true;
        queue.splice(i, 0, item);
    }
    const zippy = (index: number, input: Thing | null, end: boolean) => {
        const waitingHashes = {};
        const progressHashes = {};
        for (var i = 0; i < queue.length; i++) {
            const orig = queue[i]!;
            if (orig instanceof MatchResult) continue;
            var k = i;
            queue.splice(i--, 1);
            const result = orig.a(input, index, end);
            for (var j = 0; j < result.length; j++) {
                const newItem = result[j]!;
                if (newItem.x) {
                    queue.splice(k++, 0, new MatchResult(
                        map(newItem.b, (value, key) => [newItem.bs[key]!, newItem.ab.includes(key) ? source[value[0]]! : source.slice(value[0], value[1]!)]),
                        [newItem.s, index + +(input !== null)],
                    ));
                    if (k === 1 && !findAll) return true;
                }
                else if (newItem === orig || input !== null) {
                    addIfNotAlreadySeen(newItem, waitingHashes, k++);
                    i++;
                }
                else {
                    addIfNotAlreadySeen(newItem, progressHashes, k++);
                }
            }
        }
    };
    b: {
        for (var inputIndex = 0; inputIndex < source.length; inputIndex++) {
            const item = new NFASubstate(inputIndex, program, 0);
            queue.push(item);
            if (zippy(inputIndex, null, false)) break b;
            if (zippy(inputIndex, source[inputIndex]!, false)) break b;
        }
        zippy(inputIndex, null, true);
    }
    for (var i = 0; i < queue.length; i++) {
        if (queue[i] instanceof NFASubstate) queue.splice(i--, 1);
    }
    return queue as MatchResult[];
}
