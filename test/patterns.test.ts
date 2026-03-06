import { describe, expect, mock, test } from "bun:test";
import { keys } from "lib0/object";
import { boxNameSymbol, boxNumber, matchPattern, MatchResult, parse, Thing, ThingType, unparse } from "../src";
import { NFASubstate } from "../src/patterns/internals";
import { parsePattern } from "../src/patterns/meta";
import { F, L } from "./astCheck";

describe("step pattern NFA substates", () => {
    test("detects done", () => {
        const pat = new Thing(ThingType.sequence, [], null, "", "", "", L);
        expect(new NFASubstate(0, [[pat, 2000]]).a(null, 1, true))
            .toEqual([new NFASubstate(0, [], {}, true)]);
    })
    test("advances anchor cmds", () => {
        const pat = new Thing(ThingType.sequence, [
            new Thing(ThingType.anchor, [], true, "", "", "", L),
            new Thing(ThingType.anchor, [], false, "", "", "", L),
        ], null, "", "", "", L);
        const state = new NFASubstate(0, [[pat, 0]]);
        const sStep = new NFASubstate(0, [[pat, 1]]);
        const sStep2 = new NFASubstate(0, [[pat, 2]]);
        expect(state.a(null, 0, false))
            .toEqual([sStep]);
        expect(state.a(null, 1, false))
            .toEqual([]);
        expect(sStep.a(null, 0, true))
            .toEqual([sStep2]);
        expect(sStep.a(null, 0, false))
            .toEqual([]);
    });
    test("basic sequence", () => {
        const pat = new Thing(ThingType.sequence, [
            new Thing(ThingType.matchvalue, [boxNumber(2, L)], null, "", "", "", L),
            new Thing(ThingType.matchvalue, [boxNumber(3, L)], null, "", "", "", L),
            new Thing(ThingType.matchvalue, [boxNumber(4, L)], null, "", "", "", L),
        ], null, "", "", "", L);
        const state = new NFASubstate(0, [[pat, 0]]);
        const x1 = state.a(boxNumber(0, L), 0, false);
        const c1 = state.a(boxNumber(2, L), 0, false);
        expect(x1).toEqual([]);
        expect(c1).toEqual([new NFASubstate(0, [[pat, 1]])]);
        const x2 = c1[0]!.a(boxNumber(1, L), 0, false);
        const c2 = c1[0]!.a(boxNumber(3, L), 0, false);
        expect(x2).toEqual([]);
        expect(c2).toEqual([new NFASubstate(0, [[pat, 2]])]);
        const x3 = c2[0]!.a(boxNumber(2, L), 0, false);
        const c3 = c2[0]!.a(boxNumber(4, L), 0, false);
        expect(x3).toEqual([]);
        expect(c3).toEqual([new NFASubstate(0, [[pat, 3]])]);
        const c4 = c3[0]!.a(null, 0, false);
        expect(c4).toEqual([new NFASubstate(0, [], {}, true)]);
    });
    test("matches by type", () => {
        const pat = new Thing(ThingType.sequence, [
            new Thing(ThingType.matchtype, [], ThingType.name, "", "", "", L),
        ], null, "", "", "", L);
        const state = new NFASubstate(0, [[pat, 0]]);
        const sStep = new NFASubstate(0, [[pat, 1]]);
        const input1 = boxNameSymbol("hi", L);
        const input2 = boxNameSymbol("bye", L);
        const input3 = boxNumber(123, L);
        expect(state.a(null, 0, false))
            .toEqual([state]);
        expect(state.a(input1, 0, false))
            .toEqual([sStep]);
        expect(state.a(input2, 0, false))
            .toEqual([sStep]);
        expect(state.a(input3, 0, false))
            .toEqual([]);
    });
    test("matches by value", () => {
        const input1 = boxNameSymbol("hi", L);
        const input2 = boxNameSymbol("bye", L);
        const input3 = boxNumber(123, L);
        const pat = new Thing(ThingType.sequence, [
            new Thing(ThingType.matchvalue, [input1], null, "", "", "", L),
        ], null, "", "", "", L);
        const state = new NFASubstate(0, [[pat, 0]]);
        const sStep = new NFASubstate(0, [[pat, 1]]);
        expect(state.a(null, 0, false))
            .toEqual([state]);
        expect(state.a(input1, 0, false))
            .toEqual([sStep]);
        expect(state.a(input2, 0, false))
            .toEqual([]);
        expect(state.a(input3, 0, false))
            .toEqual([]);
    });
    test("processed capture groups", () => {
        const pat = new Thing(ThingType.sequence, [
            new Thing(ThingType.group, [
                boxNameSymbol("foo", L),
                new Thing(ThingType.matchtype, [], ThingType.number, "", "", "", L)
            ], null, "", "", "", L),
        ], null, "", "", "", L);
        const state = new NFASubstate(0, [[pat, 0]]);
        const stepped = state.a(null, 12345, false);
        const stepped2 = stepped[0]!.a(boxNumber(123, L), 0, false);
        expect(stepped).toEqual([new NFASubstate(0, [[pat, 0], [pat.c[0]!, 1]], { foo: [12345, null] }, false, ["foo"], { foo: boxNameSymbol("foo", L) })]);
        expect(stepped[0]!.a(null, 0, false)).toEqual([stepped[0]!]);
        expect(stepped2).toEqual([new NFASubstate(0, [[pat, 0], [pat.c[0]!, 2]], { foo: [12345, null] }, false, ["foo"], { foo: boxNameSymbol("foo", L) })]);
        expect(stepped[0]!.a(boxNameSymbol("hi", L), 0, false)).toEqual([]);
        expect(stepped2[0]!.a(null, 23456, false))
            .toEqual([new NFASubstate(0, [[pat, 1]], { foo: [12345, 23456] }, false, ["foo"], { foo: boxNameSymbol("foo", L) })]);
    });
    test("alternatives", () => {
        const indexes = new Array(1000).fill(0).map((_, i) => i);
        const inputs = indexes.map(n => boxNumber(n, L));
        const pat = new Thing(ThingType.sequence, [
            new Thing(ThingType.alternatives, inputs.map(n =>
                new Thing(ThingType.matchvalue, [n], null, "", "", "", L),
            ), null, "", "", "", L),
        ], null, "", "", "", L);
        const state = new NFASubstate(0, [[pat, 0]]);
        const stepped = state.a(null, 0, false);
        expect(stepped).toEqual(indexes.map(n =>
            new NFASubstate(0, [[pat, 0], [pat.c[0]!, n]]),
        ));
        for (var i = 0; i < stepped.length; i++) {
            for (var j = 0; j < inputs.length; j++) {
                expect(stepped[i]!.a(inputs[j]!, 0, false))
                    .toEqual(i === j ? [
                        new NFASubstate(0, [[pat, 1]])
                    ] : [])
            }
        }
    });
    test("optional", () => {
        const input = boxNameSymbol("hi", L);
        const lazypattern = new Thing(ThingType.sequence, [
            new Thing(ThingType.alternatives, [
                new Thing(ThingType.sequence, [], null, "", "", "", L),
                new Thing(ThingType.matchvalue, [input], null, "", "", "", L),
            ], null, "", "", "", L),
        ], null, "", "", "", L);
        const state = new NFASubstate(0, [[lazypattern, 0]]);
        const stepped = state.a(null, 0, false);
        expect(stepped).toEqual([
            new NFASubstate(0, [[lazypattern, 0], [lazypattern.c[0]!, 0]]),
            new NFASubstate(0, [[lazypattern, 0], [lazypattern.c[0]!, 1]]),
        ]);
        expect(stepped[0]!.a(null, 0, false))
            .toEqual([new NFASubstate(0, [], {}, true)]);
        expect(stepped[1]!.a(null, 0, false))
            .toEqual([stepped[1]!]);
        expect(stepped[1]!.a(input, 0, false))
            .toEqual([new NFASubstate(0, [[lazypattern, 1]])]);
    });
    test("repeat", () => {
        const input = boxNameSymbol("hi", L);
        const lazypattern = new Thing(ThingType.sequence, [
            new Thing(ThingType.repeat, [
                new Thing(ThingType.matchvalue, [input], null, "", "", "", L),
            ], false, "", "", "", L),
        ], null, "", "", "", L);
        const greedypattern = new Thing(ThingType.sequence, [
            new Thing(ThingType.repeat, [
                new Thing(ThingType.matchvalue, [input], null, "", "", "", L),
            ], true, "", "", "", L),
        ], null, "", "", "", L);
        const state = new NFASubstate(0, [[lazypattern, 0]]);
        const state2 = new NFASubstate(0, [[greedypattern, 0]]);
        const stepped = state.a(null, 0, false);
        const stepped2 = state2.a(null, 0, false);
        // repeat is 1-or-more so the first time should always jump in
        expect(stepped).toEqual([
            new NFASubstate(0, [[lazypattern, 0], [lazypattern.c[0]!, 0]]),
        ]);
        expect(stepped2).toEqual([
            new NFASubstate(0, [[greedypattern, 0], [greedypattern.c[0]!, 0]]),
        ]);
        const step2 = stepped[0]!.a(input, 0, false)[0]!.a(null, 0, false);
        const step22 = stepped2[0]!.a(input, 0, false)[0]!.a(null, 0, false);
        // after repeat: the result index should have the exit first if lazy
        expect(step2).toEqual([
            new NFASubstate(0, [[lazypattern, 1]]),
            new NFASubstate(0, [[lazypattern, 0], [lazypattern.c[0]!, 0]]),
        ]);
        expect(step22).toEqual([
            new NFASubstate(0, [[greedypattern, 0], [greedypattern.c[0]!, 0]]),
            new NFASubstate(0, [[greedypattern, 1]]),
        ]);
    });
});
describe("full pattern match", () => {
    test("empty matches don't lock up or spam", () => {
        const pat = new Thing(ThingType.sequence, [], null, "", "", "", L);
        const indexes = new Array(10000).fill(0).map((_, i) => i);
        const inputs = indexes.map(n => boxNumber(n, L));

        const result = matchPattern(inputs, pat);
        expect(result).toEqual(indexes.map(i => new MatchResult(
            [],
            [i, i]
        )));
    });
    test("findAll=false works", () => {
        const pat = new Thing(ThingType.sequence, [], null, "", "", "", L);
        const inputs = new Array(10000).fill(0).map((_, i) => boxNumber(i, L));
        const m = mock(() => boxNumber(1, L));
        Object.defineProperty(inputs, 1, { get: m });
        const result = matchPattern(inputs, pat, false);
        expect(m).not.toHaveBeenCalled();
        expect(result).toEqual([new MatchResult(
            [],
            [0, 0]
        )]);
    });
    test("basic sequence search", () => {
        const targetSpan = [100, 900];
        const inputs = new Array(10000).fill(0).map((_, n) => boxNumber(n, L));
        const pat = new Thing(ThingType.sequence, inputs.slice(targetSpan[0], targetSpan[1]).map(n =>
            new Thing(ThingType.matchvalue, [n], null, "", "", "", L),
        ), null, "", "", "", L);
        const result = matchPattern(inputs, pat);
        expect(result).toEqual([
            new MatchResult(
                [],
                targetSpan as any,
            )
        ]);
    });
    test("repeat finds all occurrences", () => {
        const zeros = new Array(200).fill(0).map(_ => boxNumber(0, L));
        const greedypattern = new Thing(ThingType.sequence, [
            new Thing(ThingType.repeat, [
                new Thing(ThingType.matchvalue, [boxNumber(0, L)], null, "", "", "", L),
            ], true, "", "", "", L),
        ], null, "", "", "", L);
        const lazypattern = new Thing(ThingType.sequence, [
            new Thing(ThingType.repeat, [
                new Thing(ThingType.matchvalue, [boxNumber(0, L)], null, "", "", "", L),
            ], false, "", "", "", L),
        ], null, "", "", "", L);
        const resultGreedy = matchPattern(zeros, greedypattern);
        const resultLazy = matchPattern(zeros, lazypattern);
        expect(resultGreedy[0]!.span).toEqual([0, zeros.length]);
        expect(resultLazy[0]!.span).toEqual([0, 1]);
        const byStartGreedy: Record<number, number[]> = {};
        for (var result of resultGreedy) {
            (byStartGreedy[result.span[0]] ??= []).push(result.span[1]);
        }
        const byStartLazy: Record<number, number[]> = {};
        for (var result of resultLazy) {
            (byStartLazy[result.span[0]] ??= []).push(result.span[1]);
        }
        expect(keys(byStartGreedy)).toEqual(zeros.map((_, i) => String(i)));
        expect(keys(byStartLazy)).toEqual(zeros.map((_, i) => String(i)));
        for (var key of keys(byStartGreedy)) {
            const n = Number(key);
            expect(byStartGreedy[n]).toEqual(zeros.slice(n).map((_, i) => zeros.length - i));
        }
        for (var key of keys(byStartLazy)) {
            const n = Number(key);
            expect(byStartLazy[n]).toEqual(zeros.slice(n).map((_, i) => i + n + 1));
        }
    });
    test("alternation", () => {
        const pat = new Thing(ThingType.sequence, [
            new Thing(ThingType.alternatives, [
                new Thing(ThingType.matchvalue, [boxNumber(0, L)], null, "", "", "", L),
                new Thing(ThingType.sequence, [
                    new Thing(ThingType.matchvalue, [boxNumber(1, L)], null, "", "", "", L),
                    new Thing(ThingType.matchvalue, [boxNumber(2, L)], null, "", "", "", L)
                ], null, "", "", "", L),
            ], null, "", "", "", L),
        ], null, "", "", "", L);
        const inputs = [
            boxNumber(2, L),
            boxNumber(1, L),
            boxNumber(7, L),
            boxNumber(0, L),
            boxNumber(1, L),
            boxNumber(4, L),
            boxNumber(2, L),
            boxNumber(0, L),
            boxNumber(1, L),
            boxNumber(2, L),
        ];
        const results = matchPattern(inputs, pat);
        expect(results).toEqual([
            new MatchResult(
                [],
                [3, 4]
            ),
            new MatchResult(
                [],
                [7, 8]
            ),
            new MatchResult(
                [],
                [8, 10]
            )
        ]);
    })
    test("capture groups", () => {
        const pat = new Thing(ThingType.sequence, [
            new Thing(ThingType.matchvalue, [boxNumber(0, L)], null, "", "", "", L),
            new Thing(ThingType.group, [
                boxNameSymbol("foo", L),
                new Thing(ThingType.matchtype, [], ThingType.name, "", "", "", L),
            ], null, "", "", "", L),
            new Thing(ThingType.matchvalue, [boxNumber(1, L)], null, "", "", "", L),
        ], null, "", "", "", L);
        const inputs = [
            boxNumber(2, L),
            boxNameSymbol("bye", L),
            boxNumber(1, L),
            boxNumber(7, L),
            boxNumber(0, L),
            boxNameSymbol("hi2", L),
            boxNumber(1, L),
            boxNumber(4, L),
            boxNumber(2, L),
            boxNumber(0, L),
            boxNameSymbol("hi3", L),
            boxNumber(1, L),
        ];
        const results = matchPattern(inputs, pat);
        expect(results).toEqual([
            new MatchResult(
                [[boxNameSymbol("foo", L), boxNameSymbol("hi2", L)]],
                [4, 7],
            ),
            new MatchResult(
                [[boxNameSymbol("foo", L), boxNameSymbol("hi3", L)]],
                [9, 12]
            ),
        ]);
    });
    test("lazy vs. greedy grouping", () => {
        const lazyfirstpat = new Thing(ThingType.sequence, [
            new Thing(ThingType.anchor, [], true, "", "", "", L),
            new Thing(ThingType.group, [
                boxNameSymbol("foo", L),
                new Thing(ThingType.repeat, [
                    new Thing(ThingType.matchvalue, [boxNumber(0, L)], null, "", "", "", L),
                ], false, "", "", "", L),
            ], null, "", "", "", L),
            new Thing(ThingType.repeat, [
                new Thing(ThingType.matchvalue, [boxNumber(0, L)], null, "", "", "", L),
            ], true, "", "", "", L),
            new Thing(ThingType.anchor, [], false, "", "", "", L),
        ], null, "", "", "", L);
        const lazysecondpat = new Thing(ThingType.sequence, [
            new Thing(ThingType.anchor, [], true, "", "", "", L),
            new Thing(ThingType.group, [
                boxNameSymbol("foo", L),
                new Thing(ThingType.repeat, [
                    new Thing(ThingType.matchvalue, [boxNumber(0, L)], null, "", "", "", L),
                ], true, "", "", "", L),
            ], null, "", "", "", L),
            new Thing(ThingType.repeat, [
                new Thing(ThingType.matchvalue, [boxNumber(0, L)], null, "", "", "", L),
            ], false, "", "", "", L),
            new Thing(ThingType.anchor, [], false, "", "", "", L),
        ], null, "", "", "", L);
        const inputs = new Array(300).fill(0).map(_ => boxNumber(0, L));
        const resultslazyfirst = matchPattern(inputs, lazyfirstpat);
        const resultslazysecond = matchPattern(inputs, lazysecondpat);
        expect(resultslazyfirst.map(r => (r.bindings[0]![1] as Thing[]).length))
            .toEqual(inputs.slice(1).map((_, i) => i + 1));
        expect(resultslazysecond.map(r => (r.bindings[0]![1] as Thing[]).length))
            .toEqual(inputs.slice(1).map((_, i) => inputs.length - i - 1));
    })
});
describe("metapattern", () => {
    function pat(src: string) { return parsePattern(parse(src, F).c); }

    test("a", () => {
        console.log(unparse(pat("a...1 b...")));
    });
    test("simple wildcard", () => {
        const p = pat("foo");
        // foo should become a capture of any element named foo
        expect(p.c[0]!.t).toBe(ThingType.group);
        expect((p.c[0]!.c[0] as Thing).v).toBe("foo");
    });

    test("repeat lazy and greedy", () => {
        const lazy = pat("x...");
        expect(lazy.c[0]!.t).toBe(ThingType.repeat);
        expect(lazy.c[0]!.v).toBe(false);
        const greedy = pat("x ... [+]");
        expect(greedy.c[0]!.t).toBe(ThingType.repeat);
        expect(greedy.c[0]!.v).toBe(true);
    });

    test("alternation", () => {
        const a = pat("{a|b}");
        expect(a.c[0]!.t).toBe(ThingType.alternatives);
    });

    test("capture with parentheses", () => {
        const g = pat("[foo (bar baz)]");
        expect(g.c[0]!.t).toBe(ThingType.group);
        expect(g.c[0]!.c[0]!.v).toBe("foo");
    });

    test("type capture", () => {
        const t = pat("[foo: roundblock]");
        expect(t.c[0]!.t).toBe(ThingType.group);
        expect(t.c[0]!.c[1]!.t).toBe(ThingType.matchtype);
        expect(t.c[0]!.c[1]!.v).toBe(ThingType.roundblock);
    });

    test("literal match", () => {
        const l = pat("[=+]");
        expect(l.c[0]!.t).toBe(ThingType.matchvalue);
        expect(l.c[0]!.c[0]!.v).toBe("+");
    });

    test("spaces semantics", () => {
        const s = pat("  "); // two spaces -> one or more
        expect(s.c[0]!.t).toBe(ThingType.repeat);
        // single space should be optional (alternation with nothing)
        const s1 = pat(" ");
        expect(s1.c[0]!.t).toBe(ThingType.alternatives);
        const nl = pat("\n"); // newline matches literally
        expect(nl.c[0]!.t).toBe(ThingType.matchvalue);
    });
});
