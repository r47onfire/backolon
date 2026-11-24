import { describe, expect, test } from "bun:test";
import { BackolonVM, Env, Importer, IndexResolver, Task } from "../src";
import { BTypeError, BValueError } from "../src/errors/classes";
import { Builtin, ONE_ARG_SIG } from "../src/obj/builtin_function";
import {
    ComparisonOp,
    NotImplemented,
    runBinaryMethod,
    totalOrdering,
} from "../src/obj/protocol";
import "../src/obj/monkey";

const vm = new BackolonVM(new Importer(new IndexResolver(), []));
const task = new Task(vm, "test", 0);
const env = new Env();

const drive = (gen: Generator<any, any, any>): any => {
    let step = gen.next();
    while (!step.done) step = gen.next(step.value);
    return step.value;
};

/** Run a binary operation the way the language does: left <op> right. */
const v = (op: string, left: any, right: any): any =>
    drive(runBinaryMethod(task, env, null, null, op, left, right));

/** Run a unary dunder: unary operations have no reflected form to try. */
const u = (dunder: any, thisArg: any): any =>
    drive(dunder.run(task, env, null, null, thisArg, []));

describe("Number", () => {
    test("add, including the bigint mixing rules", () => {
        expect(v("add", 5, 3)).toBe(8);
        expect(v("add", 5, 3n)).toBe(8n);
        expect(v("add", 5.5, 3n)).toBe(8.5);
        expect(v("add", 3n, 5)).toBe(8n);
        expect(() => v("add", 5, "a")).toThrow(
            new BTypeError("backolon.operator.wrong_type.binary"),
        );
    });

    test("sub and rsub", () => {
        expect(v("sub", 5, 8)).toBe(-3);
        expect(v("sub", 5, 3n)).toBe(2n);
        expect(v("sub", 3n, 5)).toBe(-2n);
        expect(v("sub", 10n, 2.5)).toBe(7.5);
        expect(() => v("sub", 5, null)).toThrow(BTypeError);
    });

    test("mul and rmul", () => {
        expect(v("mul", 4, 2.5)).toBe(10);
        expect(v("mul", 4, 2n)).toBe(8n);
        expect(v("mul", 2n, 4)).toBe(8n);
        // a string on the right repeats: its reflected dunder handles it
        expect(v("mul", 4, "a")).toBe("aaaa");
        expect(() => v("mul", 4, {})).toThrow(
            "backolon.operator.wrong_type.binary",
        );
    });

    test("div and rdiv: bigint division truncates, float division is JS", () => {
        expect(v("div", 5, 2)).toBe(2.5);
        expect(v("div", 5, 2n)).toBe(2n);
        expect(v("div", 5.5, 2n)).toBe(2.75);
        expect(v("div", 1, 0)).toBe(Infinity);
        expect(() => v("div", 5, 0n)).toThrow(
            new BValueError("backolon.operator.divide_by_zero"),
        );
        expect(v("div", 10n, 5)).toBe(2n);
        expect(v("div", 10, 2)).toBe(5);
        expect(() => v("div", 10n, 0)).toThrow(BValueError);
    });

    test("neg and abs", () => {
        expect(u((5).__neg__, 5)).toBe(-5);
        expect(u((-5).__abs__, -5)).toBe(5);
    });

    test("comparisons across the numeric tower", () => {
        expect(v("lt", 5, 10n)).toBeTrue();
        expect(v("lt", 5, true)).toBeFalse();
        expect(v("gte", 5, 5n)).toBeTrue();
        expect(() => v("lt", 5, "a")).toThrow(
            new BTypeError("backolon.operator.wrong_type.binary"),
        );
    });

    test("eq and ne: value equality for numerics, false for the rest", () => {
        expect(v("eq", 5, 5n)).toBeTrue();
        expect(v("eq", 5.5, 5n)).toBeFalse();
        expect(v("eq", 1, true)).toBeTrue();
        expect(v("eq", 1, "1")).toBeFalse();
        expect(v("ne", 1, "1")).toBeTrue();
        expect(v("ne", 1, 1n)).toBeFalse();
    });
});

describe("BigInt", () => {
    test("add, including the number mixing rules", () => {
        expect(v("add", 5n, 3n)).toBe(8n);
        expect(v("add", 5n, 3)).toBe(8n);
        expect(v("add", 5n, 3.5)).toBe(8.5);
        expect(v("add", 3, 5n)).toBe(8n);
        expect(() => v("add", 5n, "a")).toThrow(
            new BTypeError("backolon.operator.wrong_type.binary"),
        );
    });

    test("sub, rsub, mul", () => {
        expect(v("sub", 5n, 10)).toBe(-5n);
        expect(v("sub", 3, 5n)).toBe(-2n);
        expect(v("sub", 3.5, 5n)).toBe(-1.5);
        expect(v("mul", 5n, 3)).toBe(15n);
        expect(v("mul", 5n, 1.5)).toBe(7.5);
    });

    test("div truncates and errors on zero", () => {
        expect(v("div", 5n, 2n)).toBe(2n);
        expect(v("div", 5n, 2)).toBe(2n);
        expect(v("div", 5n, 2.5)).toBe(2);
        expect(() => v("div", 5n, 0n)).toThrow(BValueError);
        expect(() => v("div", 5n, 0)).toThrow(
            new BValueError("backolon.operator.divide_by_zero"),
        );
        expect(v("div", 10n, 5n)).toBe(2n);
        expect(() => v("div", 10n, 0n)).toThrow(BValueError);
        expect(() => v("div", 5n, "a")).toThrow(
            new BTypeError("backolon.operator.wrong_type.binary"),
        );
    });

    test("neg, abs, comparisons, eq", () => {
        expect(u((-5n).__neg__, -5n)).toBe(5n);
        expect(u((-5n).__abs__, -5n)).toBe(5n);
        expect(v("lt", 5n, 5.5)).toBeTrue();
        expect(v("gt", 10n, true)).toBeTrue();
        expect(() => v("lt", 5n, "a")).toThrow(
            new BTypeError("backolon.operator.wrong_type.binary"),
        );
        expect(v("eq", 5n, 5)).toBeTrue();
        expect(v("eq", 5n, 5.5)).toBeFalse();
        expect(v("eq", 0n, false)).toBeTrue();
        expect(v("ne", 5n, 5)).toBeFalse();
    });
});

describe("Boolean", () => {
    test("arithmetic delegates to Number with the value as 0/1", () => {
        expect(v("add", true, true)).toBe(2);
        expect(v("add", true, 1n)).toBe(2n);
        expect(v("sub", false, 1)).toBe(-1);
        expect(v("sub", 5, true)).toBe(4);
        expect(v("mul", true, 3)).toBe(3);
        expect(v("div", true, 2)).toBe(0.5);
        expect(u(true.__neg__, true)).toBe(-1);
        expect(u(false.__abs__, false)).toBe(0);
        expect(() => v("add", true, "a")).toThrow(BTypeError);
    });

    test("comparisons delegate too", () => {
        expect(v("eq", true, 1)).toBeTrue();
        expect(v("eq", false, 0n)).toBeTrue();
        expect(v("lt", true, 2)).toBeTrue();
        expect(v("ne", false, 0)).toBeFalse();
    });
});

describe("String", () => {
    test("add concatenates strings only", () => {
        expect(v("add", "ab", "cd")).toBe("abcd");
        expect(() => v("add", "ab", 1)).toThrow(
            new BTypeError("backolon.operator.wrong_type.binary"),
        );
    });

    test("mul repeats, either way around", () => {
        expect(v("mul", "ab", 3)).toBe("ababab");
        expect(v("mul", "ab", -1)).toBe("");
        expect(v("mul", "ab", 2n)).toBe("abab");
        expect(v("mul", 3, "ab")).toBe("ababab");
        expect(() => v("mul", "ab", 1.5)).toThrow(
            new BTypeError("backolon.operator.wrong_type.binary"),
        );
    });

    test("comparisons are lexicographic, eq is by value", () => {
        expect(v("lt", "abc", "abd")).toBeTrue();
        expect(v("gte", "abc", "abc")).toBeTrue();
        expect(() => v("lt", "a", 1)).toThrow(
            new BTypeError("backolon.operator.wrong_type.binary"),
        );
        expect(v("eq", "a", "a")).toBeTrue();
        expect(v("eq", "a", 1)).toBeFalse();
        expect(v("ne", "a", 1)).toBeTrue();
    });
});

describe("Array", () => {
    test("add concatenates into a new array", () => {
        const a = [1, 2];
        expect(v("add", a, [3])).toEqual([1, 2, 3]);
        expect(a).toEqual([1, 2]);
        expect(() => v("add", a, 5)).toThrow(
            new BTypeError("backolon.operator.wrong_type.binary"),
        );
    });

    test("mul repeats, either way around", () => {
        expect(v("mul", [1, 2], 2)).toEqual([1, 2, 1, 2]);
        expect(v("mul", [1], 0)).toEqual([]);
        expect(v("mul", [1], -3)).toEqual([]);
        expect(v("mul", 2, [1])).toEqual([1, 1]);
        expect(() => v("mul", [1], "a")).toThrow(
            new BTypeError("backolon.operator.wrong_type.binary"),
        );
    });

    test("eq is elementwise, using each element's own __eq__", () => {
        expect(v("eq", [1, 2], [1, 2])).toBeTrue();
        expect(v("eq", [1, 2], [1, 3])).toBeFalse();
        expect(v("eq", [1], [1, 2])).toBeFalse();
        expect(v("eq", [[1]], [[1]])).toBeTrue();
        expect(v("eq", [1], 1)).toBeFalse();
        expect(v("ne", [1], [2])).toBeTrue();
    });
});

describe("Object defaults", () => {
    test("eq and ne are identity", () => {
        const o = { x: 1 };
        expect(v("eq", o, o)).toBeTrue();
        expect(v("eq", o, { x: 1 })).toBeFalse();
        expect(v("ne", o, { x: 1 })).toBeTrue();
        const f = () => 1;
        expect(v("eq", f, f)).toBeTrue();
    });

    test("the Object.prototype methods are not enumerable", () => {
        const keys: string[] = [];
        for (const k in {}) keys.push(k);
        expect(keys).toEqual([]);
    });
});

describe("totalOrdering", () => {
    // totalOrdering(left, right, less, equal, greater) returns one of
    // the three values according to how the operands compare; each
    // comparison operator is one fixed choice of the three.
    const cmp = (left: any, right: any, op: ComparisonOp): any =>
        drive(totalOrdering(task, env, null, null, left, right, op));
    const lt = (l: any, r: any) => cmp(l, r, "lt");
    const lte = (l: any, r: any) => cmp(l, r, "lte");
    const gt = (l: any, r: any) => cmp(l, r, "gt");
    const gte = (l: any, r: any) => cmp(l, r, "gte");
    const eq = (l: any, r: any) => cmp(l, r, "eq");
    const ne = (l: any, r: any) => cmp(l, r, "ne");

    test("answers from the operands' own comparison methods", () => {
        expect(lt(5, 10n)).toBeTrue();
        expect(lt(5, 5)).toBeFalse();
        expect(gt(5, 5)).toBeFalse();
        expect(gte(5, 5n)).toBeTrue();
        expect(eq(5, 5n)).toBeTrue();
        expect(ne(1, "1")).toBeTrue();
        expect(lt("abc", "abd")).toBeTrue();
        expect(gt("abc", "abd")).toBeFalse();
    });

    test("fills in the operators a type did not define", () => {
        // a type with only __lt__ and __eq__: every other operator is
        // derived by ruling outcomes out
        const sortable = (x: number): any => {
            const o: any = { x };
            o.__lt__ = new Builtin(function* (
                this: any,
                _task,
                _env,
                _traceback,
                _handlers,
                other: any,
            ) {
                return typeof other?.x === "number"
                    ? this.x < other.x
                    : NotImplemented;
            }, ONE_ARG_SIG);
            o.__eq__ = new Builtin(function* (
                this: any,
                _task,
                _env,
                _traceback,
                _handlers,
                other: any,
            ) {
                return typeof other?.x === "number"
                    ? this.x === other.x
                    : NotImplemented;
            }, ONE_ARG_SIG);
            return o;
        };
        expect(lt(sortable(1), sortable(2))).toBeTrue();
        // __lt__ alone settles these: the answer needs no __gt__ at all
        expect(gt(sortable(1), sortable(2))).toBeFalse();
        expect(lte(sortable(1), sortable(2))).toBeTrue();
        expect(gte(sortable(1), sortable(2))).toBeFalse();
        // the reflected __lt__ on the right settles this one
        expect(gt(sortable(2), sortable(1))).toBeTrue();
        // equality by elimination: both orderings fail, so it is equal,
        // without __eq__ ever being called
        expect(eq(sortable(2), sortable(2))).toBeTrue();
        expect(ne(sortable(2), sortable(2))).toBeFalse();
        expect(eq(sortable(1), sortable(2))).toBeFalse();
    });

    test("the right operand's methods answer when the left has none", () => {
        // a type with only __gt__: a comparison against a plain object
        // is answered by the mirrored call, right.__gt__(left)
        const gtOnly = (x: number): any => {
            const o: any = { x };
            o.__gt__ = new Builtin(function* (
                this: any,
                _task,
                _env,
                _traceback,
                _handlers,
                other: any,
            ) {
                return typeof other?.x === "number"
                    ? this.x > other.x
                    : NotImplemented;
            }, ONE_ARG_SIG);
            return o;
        };
        expect(lt({ x: 0 }, gtOnly(1))).toBeTrue();
        expect(lt({ x: 1 }, gtOnly(0))).toBeFalse();
    });

    test("throws when no method can decide the comparison", () => {
        expect(() => lt(5, "a")).toThrow(
            new BTypeError("backolon.operator.wrong_type.compare"),
        );
        // plain objects can be equated (identity) but not ordered
        const o = { x: 1 };
        expect(eq(o, o)).toBeTrue();
        expect(eq(o, { x: 1 })).toBeFalse();
        expect(() => lt(o, { x: 1 })).toThrow(
            new BTypeError("backolon.operator.wrong_type.compare"),
        );
    });
});
