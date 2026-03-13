import { afterEach, describe, expect, jest, spyOn, test } from "bun:test";
import { BUILTIN_ENV, BUILTIN_FUNCTIONS, Scheduler, ThingType } from "../src";
import { expectEval, expectEvalError, F } from "./astCheck";

afterEach(() => {
    jest.clearAllMocks();
});
test("empty result", () => {
    expectEval("", {
        t: ThingType.nil,
    });
});
test("roundtrip", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s.startTask(1, "a + 1", null, F);
    const s2 = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s2.loadFromSerialized(s.serializeTasks());
    expect(s2).toEqual(s);
});
test("trivial return value", () => {
    expectEval("123\n", {
        t: ThingType.number,
        v: 123
    });
});
test("double semicolon suppresses return value", () => {
    expectEval("'fail';;", {
        t: ThingType.nil,
    });
});
test("print", () => {
    const stdout = spyOn(console, "log");
    expectEval("print 1; print (print 2)", {
        t: ThingType.nil,
    });
    expect(stdout).toHaveBeenCalledTimes(3);
    expect(stdout).toHaveBeenNthCalledWith(1, "1");
    expect(stdout).toHaveBeenNthCalledWith(2, "2");
    expect(stdout).toHaveBeenNthCalledWith(3, "nil");
});
test("print with varargs", () => {
    const stdout = spyOn(console, "log");
    expectEval("print 1; print 2 3; print 4 5 6", {
        t: ThingType.nil,
    });
    expect(stdout).toHaveBeenCalledTimes(3);
    expect(stdout).toHaveBeenNthCalledWith(1, "1");
    expect(stdout).toHaveBeenNthCalledWith(2, "2 3");
    expect(stdout).toHaveBeenNthCalledWith(3, "4 5 6");
});
describe("variables", () => {
    test("declaration", () => {
        expectEval("let a", {
            t: ThingType.nil,
        });
    });
    test("declaration return value", () => {
        expectEval("let a = 1", {
            t: ThingType.number,
            v: 1
        });
    });
    test("assignment and retrieval", () => {
        const stdout = spyOn(console, "log");
        expectEval("let a = print; a 'test'; a", {
            t: ThingType.nativefunc,
            v: "print"
        });
        expect(stdout).toHaveBeenCalledTimes(1);
        expect(stdout).toHaveBeenNthCalledWith(1, "test");
    });
    test("redeclaration throws", () => {
        expectEvalError("let a; let a", "variable a already exists in this scope");
    });
});
