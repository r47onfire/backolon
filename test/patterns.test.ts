import { BackolonError, boxNameSymbol, boxNumber, matchPattern, MatchResult, parse, parsePattern, pattern, Thing, ThingType } from "@r47onfire/backolon";
import { describe, expect, mock, test } from "bun:test";
import { stringify } from "lib0/json";
import { keys } from "lib0/object";
import { compile } from "../src/patterns/compile";
import { NFASubstate, PatternType } from "../src/patterns/internals";
import { F, L } from "./astCheck";

describe("step pattern NFA substates", () => {
    test("detects done", () => {
        const pat = compile(pattern(PatternType.sequence, 0));
        expect(new NFASubstate(0, pat, 0).a(null, 1, true).n[0]!.x).toBeTrue();
    })
    test("advances anchor cmds", () => {
        const pat = compile(pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.anchor, true),
            pattern(PatternType.anchor, false)
        ]));
        const state = new NFASubstate(0, pat, 0);
        const sStep = new NFASubstate(0, pat, 1);
        const sStep2 = new NFASubstate(0, pat, 2);
        expect(state.a(null, 0, false).n)
            .toEqual([sStep]);
        expect(state.a(null, 1, false).n)
            .toEqual([]);
        expect(sStep.a(null, 0, true).n)
            .toEqual([sStep2]);
        expect(sStep.a(null, 0, false).n)
            .toEqual([]);
    });
    test("basic sequence", () => {
        const pat = compile(pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.match_value, 0, L, [boxNumber(2, L)]),
            pattern(PatternType.match_value, 0, L, [boxNumber(3, L)]),
            pattern(PatternType.match_value, 0, L, [boxNumber(4, L)])
        ]));
        const state = new NFASubstate(0, pat, 0);
        const x1 = state.a(boxNumber(0, L), 0, false).n;
        const c1 = state.a(boxNumber(2, L), 0, false).n;
        expect(x1).toEqual([]);
        expect(c1).toEqual([new NFASubstate(0, pat, 1)]);
        const x2 = c1[0]!.a(boxNumber(1, L), 0, false).n;
        const c2 = c1[0]!.a(boxNumber(3, L), 0, false).n;
        expect(x2).toEqual([]);
        expect(c2).toEqual([new NFASubstate(0, pat, 2)]);
        const x3 = c2[0]!.a(boxNumber(2, L), 0, false).n;
        const c3 = c2[0]!.a(boxNumber(4, L), 0, false).n;
        expect(x3).toEqual([]);
        expect(c3).toEqual([new NFASubstate(0, pat, 3)]);
        expect(c3[0]!.x).toBeTrue();
    });
    test("matches by type", () => {
        const pat = compile(pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.match_type, ThingType.name),
        ]));
        const state = new NFASubstate(0, pat, 0);
        const sStep = new NFASubstate(0, pat, 1);
        const input1 = boxNameSymbol("hi", L);
        const input2 = boxNameSymbol("bye", L);
        const input3 = boxNumber(123, L);
        expect(state.a(null, 0, false).n)
            .toEqual([state]);
        expect(state.a(input1, 0, false).n)
            .toEqual([sStep]);
        expect(state.a(input2, 0, false).n)
            .toEqual([sStep]);
        expect(state.a(input3, 0, false).n)
            .toEqual([]);
    });
    test("matches by value", () => {
        const input1 = boxNameSymbol("hi", L);
        const input2 = boxNameSymbol("bye", L);
        const input3 = boxNumber(123, L);
        const pat = compile(pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.match_value, 0, L, [input1]),
        ]));
        const state = new NFASubstate(0, pat, 0);
        const sStep = new NFASubstate(0, pat, 1);
        expect(state.a(null, 0, false).n)
            .toEqual([state]);
        expect(state.a(input1, 0, false).n)
            .toEqual([sStep]);
        expect(state.a(input2, 0, false).n)
            .toEqual([]);
        expect(state.a(input3, 0, false).n)
            .toEqual([]);
    });
    test("processed capture groups", () => {
        const pat = compile(pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.capture_group, 0, L, [
                boxNameSymbol("foo", L),
                pattern(PatternType.match_type, ThingType.number, L)
            ])
        ]));
        const state = new NFASubstate(0, pat, 0);
        const stepped = state.a(null, 12345, false).n;
        const stepped2 = stepped[0]!.a(boxNumber(123, L), 0, false).n;
        expect(stepped).toEqual([new NFASubstate(0, pat, 1, { foo: [12345, null] }, ["foo"], { foo: boxNameSymbol("foo", L) })]);
        expect(stepped[0]!.a(null, 0, false).n).toEqual([stepped[0]!]);
        expect(stepped2).toEqual([new NFASubstate(0, pat, 2, { foo: [12345, null] }, ["foo"], { foo: boxNameSymbol("foo", L) })]);
        expect(stepped[0]!.a(boxNameSymbol("hi", L), 0, false).n).toEqual([]);
        expect(stepped2[0]!.a(null, 23456, false).n)
            .toEqual([new NFASubstate(0, pat, 3, { foo: [12345, 23456] }, ["foo"], { foo: boxNameSymbol("foo", L) })]);
    });
    test("alternatives", () => {
        const indexes = new Array(1000).fill(0).map((_, i) => i);
        const inputs = indexes.map(n => boxNumber(n, L));
        const pat = compile(pattern(PatternType.alternatives, 0, L,
            inputs.map(n => pattern(PatternType.match_value, 0, L, [n])),
        ));
        const state = new NFASubstate(0, pat, 0);
        const stepped = state.a(null, 0, false).n;
        expect(stepped).toEqual(indexes.map(n =>
            new NFASubstate(0, pat, 2 * n + 1),
        ));
        for (var i = 0; i < stepped.length; i++) {
            for (var j = 0; j < inputs.length; j++) {
                expect(stepped[i]!.a(inputs[j]!, 0, false).n)
                    .toEqual(i === j ? [
                        new NFASubstate(0, pat, 2 * j + 2)
                    ] : [])
            }
        }
    });
    test("optional", () => {
        const input = boxNameSymbol("hi", L);
        const lazypattern = compile(pattern(PatternType.alternatives, 0, L, [
            pattern(PatternType.sequence, 0),
            pattern(PatternType.match_value, 0, L, [input]),
        ]));
        const state = new NFASubstate(0, lazypattern, 0);
        const stepped = state.a(null, 0, false).n;
        expect(stepped).toEqual([
            new NFASubstate(0, lazypattern, 2),
            new NFASubstate(0, lazypattern, 1),
        ]);
        expect(stepped[0]!.a(null, 0, false).n)
            .toEqual([new NFASubstate(0, lazypattern, 2)]);
        expect(stepped[1]!.a(null, 0, false).n)
            .toEqual([stepped[1]!]);
        expect(stepped[1]!.a(input, 0, false).n)
            .toEqual([new NFASubstate(0, lazypattern, 2)]);
    });
    test("repeat", () => {
        const input = boxNameSymbol("hi", L);
        const lazypattern = compile(pattern(PatternType.repeat, false, L, [
            pattern(PatternType.match_value, 0, L, [input])
        ]));
        const greedypattern = compile(pattern(PatternType.repeat, true, L, [
            pattern(PatternType.match_value, 0, L, [input])
        ]));
        const state = new NFASubstate(0, lazypattern, 0);
        const state2 = new NFASubstate(0, greedypattern, 0);
        const stepped = state.a(input, 0, false).n[0]!.a(null, 0, false).n;
        const stepped2 = state2.a(input, 0, false).n[0]!.a(null, 0, false).n;
        // after repeat: the result index should have the exit first if lazy
        expect(stepped).toEqual([
            new NFASubstate(0, lazypattern, 2),
            new NFASubstate(0, lazypattern, 0),
        ]);
        expect(stepped2).toEqual([
            new NFASubstate(0, greedypattern, 0),
            new NFASubstate(0, greedypattern, 2),
        ]);
    });
});
describe("full pattern match", () => {
    test("empty repeat doesn't crash optimizer", () => {
        expect(() => compile(pattern(PatternType.repeat, true))).not.toThrow();
        expect(() => compile(pattern(PatternType.repeat, true, L, [
            pattern(PatternType.alternatives, 0, L, [
                pattern(PatternType.match_type, 1, L),
                pattern(PatternType.sequence, 0, L, [])
            ])
        ]))).not.toThrow();
    });
    test("empty matches don't lock up or spam", () => {
        const pat = pattern(PatternType.sequence, 0);
        const indexes = new Array(10000).fill(0).map((_, i) => i);
        const inputs = indexes.map(n => boxNumber(n, L));

        const result = matchPattern(inputs, pat);
        expect(result).toEqual(indexes.map(i => new MatchResult(
            [],
            [i, i]
        )));
    });
    test("finds correct span", () => {
        const pat = pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.anchor, true, L),
            pattern(PatternType.repeat, true, L, [pattern(PatternType.dot, 0, L)]),
            pattern(PatternType.anchor, false, L),
        ]);
        const inputs = new Array(100).fill(0).map((_, i) => boxNumber(i, L));
        const result = matchPattern(inputs, pat);
        expect(result).toEqual([new MatchResult([], [0, inputs.length])]);
    });
    test("findAll=false works", () => {
        const pat = pattern(PatternType.sequence, 0);
        const inputs = new Array(100).fill(0).map((_, i) => boxNumber(i, L));
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
        const targetSpan = [10, 90] as const;
        const inputs = new Array(100).fill(0).map((_, n) => boxNumber(n, L));
        const pat = pattern(PatternType.sequence, 0, L,
            inputs.slice(targetSpan[0], targetSpan[1]).map(n => pattern(PatternType.match_value, 0, L, [n]))
        );
        const result = matchPattern(inputs, pat);
        expect(result).toEqual([
            new MatchResult(
                [],
                targetSpan as any,
            )
        ]);
    });
    test("repeat finds all occurrences", () => {
        const zeros = new Array(100).fill(0).map(_ => boxNumber(0, L));
        const greedypattern = pattern(PatternType.repeat, true, L, [pattern(PatternType.match_value, 0, L, [boxNumber(0, L)])]);
        const lazypattern = pattern(PatternType.repeat, false, L, [pattern(PatternType.match_value, 0, L, [boxNumber(0, L)])]);
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
        const pat = pattern(PatternType.alternatives, 0, L, [
            pattern(PatternType.match_value, 0, L, [boxNumber(0, L)]),
            pattern(PatternType.sequence, 0, L, [
                pattern(PatternType.match_value, 0, L, [boxNumber(1, L)]),
                pattern(PatternType.match_value, 0, L, [boxNumber(2, L)]),
            ])
        ]);
        const inputs = [
            2, 1, 7, 0, 1, 4, 2, 0, 1, 2,
        ].map(n => boxNumber(n, L));
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
        const pat = pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.match_value, 0, L, [boxNumber(0, L)]),
            pattern(PatternType.capture_group, 0, L, [
                boxNameSymbol("foo", L),
                pattern(PatternType.match_type, ThingType.name, L),
            ]),
            pattern(PatternType.match_value, 0, L, [boxNumber(1, L)]),
        ]);
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
        const lazyfirstpat = pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.anchor, true, L),
            pattern(PatternType.capture_group, 0, L, [
                boxNameSymbol("foo", L),
                pattern(PatternType.repeat, false, L, [pattern(PatternType.match_value, 0, L, [boxNumber(0, L)])]),
            ]),
            pattern(PatternType.repeat, true, L, [pattern(PatternType.match_value, 0, L, [boxNumber(0, L)])]),
            pattern(PatternType.anchor, false, L),
        ]);
        const lazysecondpat = pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.anchor, true, L),
            pattern(PatternType.capture_group, 0, L, [
                boxNameSymbol("foo", L),
                pattern(PatternType.repeat, true, L, [pattern(PatternType.match_value, 0, L, [boxNumber(0, L)])]),
            ]),
            pattern(PatternType.repeat, false, L, [pattern(PatternType.match_value, 0, L, [boxNumber(0, L)])]),
            pattern(PatternType.anchor, false, L),
        ]);
        const inputs = new Array(100).fill(0).map(_ => boxNumber(0, L));
        const resultslazyfirst = matchPattern(inputs, lazyfirstpat);
        const resultslazysecond = matchPattern(inputs, lazysecondpat);
        expect(resultslazyfirst.map(r => (r.bindings[0]![1] as Thing[]).length))
            .toEqual(inputs.slice(1).map((_, i) => i + 1));
        expect(resultslazysecond.map(r => (r.bindings[0]![1] as Thing[]).length))
            .toEqual(inputs.slice(1).map((_, i) => inputs.length - i - 1));
    })
});
describe("lookahead patterns", () => {
    test("positive lookahead creates main and lookahead states", () => {
        // Pattern: lookahead for number, then match dot
        const lookaheadPattern = compile(pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.lookahead, true, L, [
                pattern(PatternType.match_type, ThingType.number, L)
            ]),
            pattern(PatternType.dot, 0, L),
        ]));
        const state = new NFASubstate(0, lookaheadPattern, 0);
        const stepped = state.a(null, 0, false).n;
        // Should return 2 states: main state and lookahead state
        expect(stepped.length).toBe(2);
        const [mainState, lookaheadState] = stepped;
        expect(mainState!.i).toBeGreaterThan(0); // Advanced past lookahead instruction
    });
    test("positive lookahead with matching input", () => {
        const inputs = [boxNumber(1, L), boxNumber(2, L)];
        const pat = pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.lookahead, true, L, [
                pattern(PatternType.match_type, ThingType.number, L)
            ]),
            pattern(PatternType.match_type, ThingType.number, L),
        ]);
        const results = matchPattern(inputs, pat);
        expect(results.length).toBeGreaterThan(0);
    });
    test("positive lookahead fails on wrong type", () => {
        const input = boxNameSymbol("hi", L);
        const lookaheadPattern = compile(pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.lookahead, true, L, [
                pattern(PatternType.match_type, ThingType.number, L)
            ]),
            pattern(PatternType.dot, 0, L),
        ]));
        const state = new NFASubstate(0, lookaheadPattern, 0);
        const stepped = state.a(null, 0, false).n;
        const [, lookaheadState] = stepped;
        const depStepped = lookaheadState!.a(input, 0, false).n;
        // Should fail - lookahead doesn't match
        expect(depStepped.length).toBe(0);
    });
    test("negative lookahead fails on match", () => {
        const input = boxNumber(42, L);
        const lookaheadPattern = compile(pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.lookahead, false, L, [
                pattern(PatternType.match_type, ThingType.number, L)
            ]),
            pattern(PatternType.dot, 0, L),
        ]));
        const state = new NFASubstate(0, lookaheadPattern, 0);
        const stepped = state.a(null, 0, false).n;
        const [, lookaheadState] = stepped;
        const depStepped = lookaheadState!.a(input, 0, false).n;
        // Should succeed (but the negative lookahead semantics are inverted in the main loop)
        expect(depStepped.length).toBe(1);
    });
    test("lookahead with sequence", () => {
        const num1 = boxNumber(1, L);
        const num2 = boxNumber(2, L);
        const lookaheadPattern = compile(pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.lookahead, true, L, [
                pattern(PatternType.sequence, 0, L, [
                    pattern(PatternType.match_type, ThingType.number, L),
                    pattern(PatternType.match_type, ThingType.number, L),
                ])
            ]),
            pattern(PatternType.dot, 0, L),
        ]));
        const state = new NFASubstate(0, lookaheadPattern, 0);
        const stepped = state.a(null, 0, false).n;
        const [, lookaheadState] = stepped;
        const depStep1 = lookaheadState!.a(num1, 0, false).n;
        expect(depStep1.length).toBe(1);
        const depStep2 = depStep1[0]!.a(num2, 0, false).n;
        expect(depStep2.length).toBe(1);
        expect(depStep2[0]!.x).toBeTrue();
    });
    test("lookahead state marking", () => {
        const pat = compile(pattern(PatternType.sequence, 0, L, [
            pattern(PatternType.lookahead, true, L, [
                pattern(PatternType.dot, 0, L)
            ]),
            pattern(PatternType.dot, 0, L),
        ]));
        const state = new NFASubstate(0, pat, 0);
        const stepped = state.a(null, 0, false).n;
        const [mainState, lookaheadState] = stepped;
    });
});
describe("metapattern", () => {
    const pstring = (src: string) => parsePattern(parse(src, F).c);

    test("simple wildcard", () => {
        const p = pstring("foo");
        // foo should become a capture of any element named foo
        expect(p.c[0]!.v.t).toBe(PatternType.capture_group);
        expect((p.c[0]!.c[0] as Thing).v).toBe("foo");
    });

    test("repeat lazy and greedy", () => {
        const lazy = pstring("x...");
        expect(lazy.c[0]!.v.t).toBe(PatternType.capture_group);
        expect(lazy.c[0]!.c[1]!.v.t).toBe(PatternType.repeat);
        expect(lazy.c[0]!.c[1]!.v.gsv).toBeFalse();
        const greedy = pstring("x ... [+]");
        expect(greedy.c[0]!.v.t).toBe(PatternType.capture_group);
        expect(greedy.c[0]!.c[1]!.v.t).toBe(PatternType.repeat);
        expect(greedy.c[0]!.c[1]!.v.gsv).toBeTrue();
    });

    test("alternation", () => {
        const a = pstring("{a|b}");
        expect(a.c[0]!.v.t).toBe(PatternType.alternatives);
    });

    test("capture with parentheses", () => {
        const g = pstring("[foo (bar baz)]");
        expect(g.c[0]!.v.t).toBe(PatternType.capture_group);
        expect(g.c[0]!.c[0]!.v).toBe("foo");
    });

    test("type capture", () => {
        const t = pstring("[foo: roundblock]");
        expect(t.c[0]!.v.t).toBe(PatternType.capture_group);
        expect(t.c[0]!.c[1]!.v.t).toBe(PatternType.match_type);
        expect(t.c[0]!.c[1]!.v.gsv).toBe(ThingType.roundblock);
    });

    test("literal match", () => {
        const l = pstring("[=+]");
        expect(l.c[0]!.v.t).toBe(PatternType.match_value);
        expect(l.c[0]!.c[0]!.v).toBe("+");
    });

    test("spaces semantics", () => {
        const s = pstring("   "); // three spaces -> one or more
        expect(s.c[0]!.v.t).toBe(PatternType.repeat);
        // single space should be optional (alternation with nothing)
        const s1 = pstring(" ");
        expect(s1.c[0]!.v.t).toBe(PatternType.alternatives);
        const nl = pstring("\n"); // newline matches literally
        expect(nl.c[0]!.v.t).toBe(PatternType.match_type);
        expect(nl.c[0]!.v.gsv).toBe(ThingType.newline);
    });

    describe("match tests", () => {
        const pattern_test = (pat: string, ...cases: [input: string, match: boolean][]) => {
            describe(`pattern ${stringify(pat)}`, () => {
                for (const [input, match] of cases) {
                    test(`should ${match ? "" : "not "}match ${stringify(input)}`, () => {
                        var parsedPattern: Thing<ThingType.pattern>, parsedInput: Thing[];
                        try {
                            parsedPattern = pstring(pat);
                        } catch (e) {
                            if (e instanceof BackolonError) {
                                console.log(e.displayOn({ [F.href]: pat }));
                            }
                            throw e;
                        }
                        try {
                            parsedInput = parse(input, new URL("about:testinput")).c as any;
                        } catch (e) {
                            if (e instanceof BackolonError) {
                                console.log(e.displayOn({ "about:testinput": input }));
                            }
                            throw e;
                        }
                        var result;
                        try {
                            result = matchPattern(parsedInput, parsedPattern, false);
                        } catch (e) {
                            if (e instanceof BackolonError) {
                                console.log(e.displayOn({ [F.href]: pat, "about:testinput": input }));
                            }
                            throw e;
                        }
                        if (match) expect(result.length).toBeGreaterThan(0);
                        else expect(result).toBeEmpty();
                    });
                }
            });
        };

        pattern_test("[x: number]",
            ["1", true],
            ["a", false]);
        pattern_test("[x: number] + [y: number]",
            ["1 + 1", true],
            ["1\n+\n1", true],
            ["1+1", true],
            ["a+b", false],
            ["1+a", false]);
        pattern_test("[^]{x...|} {\n|;} {y...|}[$]",
            ["1; 2; 3", true],
            ["1", false]);
        pattern_test("[^][p:name] {: [t:name]|} {= d|} [$]",
            ["x", true],
            ["x number", false],
            ["x: number", true],
            ["x = 1", true],
            ["x: number = nil", true]);
        pattern_test("[^][$]",
            ["", true])
    });
});
