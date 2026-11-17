import { describe, expect, test } from "bun:test";
import { BTypeError, BValueError } from "../src/errors/classes";
import "../src/obj/monkey";

// the dunders are Builtins: run one against a receiver and its
// arguments. The dunders under test never yield (they are pure), so a
// plain synchronous drive runs them to completion; with no error
// handlers installed, a resumable error throws straight through.
const v = (dunder: any, thisArg: any, ...args: any[]): any => {
    const gen = dunder.run(null, null, null, null, thisArg, args);
    let step = gen.next();
    while (!step.done) step = gen.next();
    return step.value;
};

describe("Number", () => {
    test("add, including the bigint mixing rules", () => {
        expect(v((5).__add__, 5, 3)).toBe(8);
        expect(v((5).__add__, 5, 3n)).toBe(8n);
        expect(v((5.5).__add__, 5.5, 3n)).toBe(8.5);
        expect(v((5).__radd__!, 5, 3n)).toBe(8n);
        expect(() => v((5).__add__, 5, "a")).toThrow(BTypeError);
        expect(() => v((5).__add__, 5, "a")).toThrow(
            "backolon.math.wrongtype.add.number",
        );
    });

    test("sub and rsub", () => {
        expect(v((5).__sub__, 5, 8)).toBe(-3);
        expect(v((5).__sub__, 5, 3n)).toBe(2n);
        expect(v((5).__rsub__!, 5, 3n)).toBe(-2n);
        expect(v((2.5).__rsub__!, 2.5, 10n)).toBe(7.5);
        expect(() => v((5).__sub__, 5, null)).toThrow(BTypeError);
    });

    test("mul and rmul", () => {
        expect(v((4).__mul__, 4, 2.5)).toBe(10);
        expect(v((4).__mul__, 4, 2n)).toBe(8n);
        expect(v((4).__rmul__!, 4, 2n)).toBe(8n);
        expect(() => v((4).__mul__, 4, "a")).toThrow(
            "backolon.math.wrongtype.mul.number",
        );
    });

    test("div and rdiv: bigint division truncates, float division is JS", () => {
        expect(v((5).__div__, 5, 2)).toBe(2.5);
        expect(v((5).__div__, 5, 2n)).toBe(2n);
        expect(v((5.5).__div__, 5.5, 2n)).toBe(2.75);
        expect(v((1).__div__, 1, 0)).toBe(Infinity);
        expect(() => v((5).__div__, 5, 0n)).toThrow(BValueError);
        expect(() => v((5).__div__, 5, 0n)).toThrow(
            "backolon.math.undefined.div_zero.bigint",
        );
        expect(v((5).__rdiv__!, 5, 10n)).toBe(2n);
        expect(v((2).__rdiv__!, 2, 10)).toBe(5);
        expect(() => v((0).__rdiv__!, 0, 10n)).toThrow(BValueError);
    });

    test("neg and abs", () => {
        expect(v((5).__neg__!, 5)).toBe(-5);
        expect(v((-5).__abs__!, -5)).toBe(5);
    });

    test("comparisons across the numeric tower", () => {
        expect(v((5).__lt__!, 5, 10n)).toBeTrue();
        expect(v((5).__lt__!, 5, true)).toBeFalse();
        expect(v((5).__gte__!, 5, 5n)).toBeTrue();
        expect(() => v((5).__lt__!, 5, "a")).toThrow(BTypeError);
        expect(() => v((5).__lt__!, 5, "a")).toThrow(
            "backolon.compare.number.lt",
        );
    });

    test("eq and ne: value equality for numerics, false for the rest", () => {
        expect(v((5).__eq__!, 5, 5n)).toBeTrue();
        expect(v((5.5).__eq__!, 5.5, 5n)).toBeFalse();
        expect(v((1).__eq__!, 1, true)).toBeTrue();
        expect(v((1).__eq__!, 1, "1")).toBeFalse();
        expect(v((1).__ne__!, 1, "1")).toBeTrue();
        expect(v((1).__ne__!, 1, 1n)).toBeFalse();
    });
});

describe("BigInt", () => {
    test("add, including the number mixing rules", () => {
        expect(v(5n.__add__, 5n, 3n)).toBe(8n);
        expect(v(5n.__add__, 5n, 3)).toBe(8n);
        expect(v(5n.__add__, 5n, 3.5)).toBe(8.5);
        expect(v(5n.__radd__!, 5n, 3)).toBe(8n);
        expect(() => v(5n.__add__, 5n, "a")).toThrow(
            "backolon.math.wrongtype.add.bigint",
        );
    });

    test("sub, rsub, mul", () => {
        expect(v(5n.__sub__, 5n, 10)).toBe(-5n);
        expect(v(5n.__rsub__!, 5n, 3)).toBe(-2n);
        expect(v(5n.__rsub__!, 5n, 3.5)).toBe(-1.5);
        expect(v(5n.__mul__, 5n, 3)).toBe(15n);
        expect(v(5n.__mul__, 5n, 1.5)).toBe(7.5);
    });

    test("div truncates and errors on zero", () => {
        expect(v(5n.__div__, 5n, 2n)).toBe(2n);
        expect(v(5n.__div__, 5n, 2)).toBe(2n);
        expect(v(5n.__div__, 5n, 2.5)).toBe(2);
        expect(() => v(5n.__div__, 5n, 0n)).toThrow(BValueError);
        expect(() => v(5n.__div__, 5n, 0)).toThrow(
            "backolon.math.undefined.div_zero.bigint",
        );
        expect(v(5n.__rdiv__!, 5n, 10n)).toBe(2n);
        expect(() => v(0n.__rdiv__!, 0n, 10n)).toThrow(BValueError);
        expect(() => v(5n.__div__, 5n, "a")).toThrow(
            "backolon.math.wrongtype.div.bigint",
        );
    });

    test("neg, abs, comparisons, eq", () => {
        expect(v((-5n).__neg__!, -5n)).toBe(5n);
        expect(v((-5n).__abs__!, -5n)).toBe(5n);
        expect(v(5n.__lt__!, 5n, 5.5)).toBeTrue();
        expect(v(10n.__gt__!, 10n, true)).toBeTrue();
        expect(() => v(5n.__lt__!, 5n, "a")).toThrow(
            "backolon.compare.bigint.lt",
        );
        expect(v(5n.__eq__!, 5n, 5)).toBeTrue();
        expect(v(5n.__eq__!, 5n, 5.5)).toBeFalse();
        expect(v(0n.__eq__!, 0n, false)).toBeTrue();
        expect(v(5n.__ne__!, 5n, 5)).toBeFalse();
    });
});

describe("Boolean", () => {
    test("arithmetic delegates to Number with the value as 0/1", () => {
        expect(v(true.__add__, true, true)).toBe(2);
        expect(v(true.__add__, true, 1n)).toBe(2n);
        expect(v(false.__sub__, false, 1)).toBe(-1);
        expect(v(true.__rsub__!, true, 5)).toBe(4);
        expect(v(true.__mul__!, true, 3)).toBe(3);
        expect(v(true.__div__!, true, 2)).toBe(0.5);
        expect(v(true.__neg__!, true)).toBe(-1);
        expect(v(false.__abs__!, false)).toBe(0);
        expect(() => v(true.__add__, true, "a")).toThrow(BTypeError);
    });

    test("comparisons delegate too", () => {
        expect(v(true.__eq__!, true, 1)).toBeTrue();
        expect(v(false.__eq__!, false, 0n)).toBeTrue();
        expect(v(true.__lt__!, true, 2)).toBeTrue();
        expect(v(false.__ne__!, false, 0)).toBeFalse();
    });
});

describe("String", () => {
    test("add concatenates strings only", () => {
        expect(v("ab".__add__, "ab", "cd")).toBe("abcd");
        expect(() => v("ab".__add__, "ab", 1)).toThrow(
            "backolon.math.string.add",
        );
    });

    test("mul repeats, either way around", () => {
        expect(v("ab".__mul__, "ab", 3)).toBe("ababab");
        expect(v("ab".__mul__, "ab", -1)).toBe("");
        expect(v("ab".__mul__, "ab", 2n)).toBe("abab");
        expect(v("ab".__rmul__, "ab", 3)).toBe("ababab");
        expect(() => v("ab".__mul__, "ab", 1.5)).toThrow(
            "backolon.math.string.mul",
        );
    });

    test("comparisons are lexicographic, eq is by value", () => {
        expect(v("abc".__lt__!, "abc", "abd")).toBeTrue();
        expect(v("abc".__gte__!, "abc", "abc")).toBeTrue();
        expect(() => v("a".__lt__!, "a", 1)).toThrow(
            "backolon.compare.string.lt",
        );
        expect(v("a".__eq__!, "a", "a")).toBeTrue();
        expect(v("a".__eq__!, "a", 1)).toBeFalse();
        expect(v("a".__ne__!, "a", 1)).toBeTrue();
    });
});

describe("Array", () => {
    test("add concatenates into a new array", () => {
        const a = [1, 2];
        expect(v(a.__add__, a, [3])).toEqual([1, 2, 3]);
        expect(a).toEqual([1, 2]);
        expect(() => v(a.__add__, a, 5)).toThrow("backolon.math.array.add");
    });

    test("mul repeats, either way around", () => {
        expect(v([1, 2].__mul__, [1, 2], 2)).toEqual([1, 2, 1, 2]);
        expect(v([1].__mul__, [1], 0)).toEqual([]);
        expect(v([1].__mul__, [1], -3)).toEqual([]);
        expect(v([1].__rmul__, [1], 2)).toEqual([1, 1]);
        expect(() => v([1].__mul__, [1], "a")).toThrow(
            "backolon.math.array.mul",
        );
    });

    test("eq is elementwise, using each element's own __eq__", () => {
        expect(v([1, 2].__eq__, [1, 2], [1, 2])).toBeTrue();
        expect(v([1, 2].__eq__, [1, 2], [1, 3])).toBeFalse();
        expect(v([1].__eq__, [1], [1, 2])).toBeFalse();
        expect(v([[1]].__eq__, [[1]], [[1]])).toBeTrue();
        expect(v([1].__eq__, [1], 1)).toBeFalse();
        expect(v([1].__ne__, [1], [2])).toBeTrue();
    });
});

describe("Object defaults", () => {
    test("eq and ne are identity", () => {
        const o = { x: 1 };
        expect(v((o as any).__eq__, o as any, o)).toBeTrue();
        expect(v((o as any).__eq__, o as any, { x: 1 })).toBeFalse();
        expect(v((o as any).__ne__, o as any, { x: 1 })).toBeTrue();
        const f = () => 1;
        expect(v((f as any).__eq__, f as any, f)).toBeTrue();
    });

    test("the Object.prototype methods are not enumerable", () => {
        const keys: string[] = [];
        for (const k in {}) keys.push(k);
        expect(keys).toEqual([]);
    });
});
