import { stringify } from "lib0/json";
import { keys, values } from "lib0/object";
import { LocationTrace, ParseError, RuntimeError } from "../errors";
import { CheckedType, isBlock, Thing, ThingType, typecheck } from "../objects/thing";

export interface BlockRule {
    /** type to wrap the block in */
    t: CheckedType<typeof isBlock>,
    /** ending string sequences (null means EOF) */
    e: (string | null)[],
    /** greedy (does it consume the end tokens) */
    g?: boolean,
    /** inner blocks allowed */
    i: Record<string, string>,
    /** escapes to override end or inner blocks */
    x: string[],
    /** banned token sequences */
    b: string[],
    /** process full block */
    p(items: Thing[], start: string, end: string, loc: LocationTrace): Thing;
}

type Counter = [tokens: number, chars: number];

export function blockParse<T extends Record<string, BlockRule>, U extends keyof T>(tokens: Thing[], blockRules: T, toplevel: U): ReturnType<T[U]["p"]> {
    var pos = 0;
    const nextToken = (advanceEnd: boolean, beginStr: string, beginLoc: LocationTrace): Thing => {
        if (pos >= tokens.length) {
            throw new ParseError(`${stringify(beginStr)} was never closed`, beginLoc);
        }
        const token = tokens[pos]!;
        if (!typecheck(ThingType.end)(token) || advanceEnd) pos++;
        return token;
    };
    const processCounters = (txt: string | null, starts: (string | null)[], counters: Counter[], targets: string[], onMatch: (target: string, counter: Counter, start: string) => void) => {
        for (var i = 0; i < counters.length; i++) {
            const start = starts[i], counter = counters[i]!;
            if (start === null) {
                if (txt !== null) continue;
                onMatch(targets[i]!, counter, "");
                continue;
            }
            if (start!.startsWith(txt!, counter[1])) {
                counter[0]++;
                counter[1] += txt!.length;
                if (counter[1] >= start!.length) {
                    onMatch(targets[i]!, counter, start!);
                    counter[0] = counter[1] = 0;
                }
            } else counter[0] = counter[1] = 0;
        }
    }
    const parseBlock = <T extends BlockRule>(rule: T, beginStr: string, beginLoc: LocationTrace): ReturnType<T["p"]> => {
        const blockContents: Thing[] = [];
        const ruleStarts = keys(rule.i);
        const ruleTargets = values(rule.i);
        const indices: Counter[] = ruleStarts.map(_ => [0, 0]);
        const skips = rule.x;
        const skipIndices: Counter[] = skips.map(_ => [0, 0]);
        const banned = rule.b;
        const bannedIndices: Counter[] = banned.map(_ => [0, 0]);
        const end = rule.e;
        var endStr = "";
        const endCounters: Counter[] = rule.e?.map(_ => [0, 0]) ?? [];
        var forceContinue: boolean,
            innerBlock: string | null = null,
            innerBlockStart: string | null = null,
            innerBlockStarterTokens: number | null = null
            ;
        for (; ;) {
            forceContinue = false;
            innerBlock = innerBlockStarterTokens = null;
            const curToken = nextToken(!end.includes(null), beginStr, beginLoc), txt: string | null = curToken.v as string;
            processCounters(txt, skips, skipIndices, [], _ => forceContinue = true);
            if (!forceContinue) {
                processCounters(txt, ruleStarts, indices, ruleTargets, (target, counter, start) => {
                    innerBlock = target;
                    innerBlockStarterTokens = counter[0];
                    innerBlockStart = start;
                })
                var done = false;
                processCounters(txt, end, endCounters, [], (_, c) => {
                    done = true;
                    if (!(rule.g ?? true)) pos -= c[0], endStr = "";
                    else endStr = txt || "";
                });
                if (done) break;
                processCounters(txt, banned, bannedIndices, banned, (target, counter) => {
                    throw new RuntimeError(`unexpected ${stringify(target)}`, curToken.loc);
                });
            }
            blockContents.push(curToken);
            if (!forceContinue && innerBlock) {
                const startingTokens = blockContents.splice(blockContents.length - innerBlockStarterTokens!, innerBlockStarterTokens!);
                blockContents.push(parseBlock(blockRules[innerBlock]!, innerBlockStart!, startingTokens[0]!.loc) as any);
            }
        }
        // @ts-expect-error
        return rule.p(blockContents, beginStr, endStr, beginLoc);
    };
    return parseBlock(blockRules[toplevel]!, "", tokens[0]!.loc);
}
