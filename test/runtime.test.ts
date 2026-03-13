import { afterEach, describe, expect, jest, spyOn, test } from "bun:test";
import { boxNumber, BUILTIN_ENV, BUILTIN_FUNCTIONS, Scheduler, ThingType } from "../src";
import { F, L } from "./astCheck";

afterEach(() => {
    jest.clearAllMocks();
});
test("empty result", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    const t = s.startTask(1, "\n", null, F);
    s.stepUntilSuspended();
    expect(t.stack).toBeEmpty();
    expect(t.result).not.toBeNull();
    expect(t.result!.t).toBe(ThingType.nil);
});
test("roundtrip", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s.startTask(1, "a + 1", null, F);
    const s2 = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s2.loadFromSerialized(s.serializeTasks());
    expect(s2).toEqual(s);
});
test("trivial return value", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    const t = s.startTask(1, "123\n", null, F);
    s.stepUntilSuspended();
    expect(t.stack).toBeEmpty();
    expect(t.result).toEqual(boxNumber(123, L));
});
test("double semicolon suppresses return value", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    const t = s.startTask(1, "'fail';;", null, F);
    s.stepUntilSuspended();
    expect(t.stack).toBeEmpty();
    expect(t.result!.t).toBe(ThingType.nil);
});
test("print", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s.startTask(1, "print 1; print (print 2)", null, F);
    const stdout = spyOn(console, "log");
    s.stepUntilSuspended();
    expect(stdout).toHaveBeenCalledTimes(3);
    expect(stdout).toHaveBeenNthCalledWith(1, "1");
    expect(stdout).toHaveBeenNthCalledWith(2, "2");
    expect(stdout).toHaveBeenNthCalledWith(3, "nil");
});
test("print with varargs", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s.startTask(1, "print 1; print 2 3; print 4 5 6", null, F);
    const stdout = spyOn(console, "log");
    s.stepUntilSuspended();
    expect(stdout).toHaveBeenCalledTimes(3);
    expect(stdout).toHaveBeenNthCalledWith(1, "1");
    expect(stdout).toHaveBeenNthCalledWith(2, "2 3");
    expect(stdout).toHaveBeenNthCalledWith(3, "4 5 6");
});
describe("variables", () => {
    test("declaration", () => {
        const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
        const t = s.startTask(1, "let a", null, F);
        s.stepUntilSuspended();
        expect(t.stack).toBeEmpty();
        expect(t.result!.t).toBe(ThingType.nil);
    });
    test("declaration return value", () => {
        const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
        const t = s.startTask(1, "let a = 1", null, F);
        s.stepUntilSuspended();
        expect(t.stack).toBeEmpty();
        expect(t.result!.t).toBe(ThingType.number);
        expect(t.result!.v).toBe(1);
    });
    test("assignment and retrieval", () => {
        const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
        const t = s.startTask(1, "let a = print; a 'test'; a", null, F);
        const stdout = spyOn(console, "log");
        s.stepUntilSuspended();
        expect(t.stack).toBeEmpty();
        expect(t.result!.t).toBe(ThingType.nativefunc);
        expect(t.result!.v).toBe("print");
        expect(stdout).toHaveBeenCalledTimes(1);
        expect(stdout).toHaveBeenNthCalledWith(1, "test");
    });
    test("redeclaration throws", () => {
        const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
        s.startTask(1, "let a; let a", null, F);
        expect(() => s.stepUntilSuspended()).toThrow("variable a already exists in this scope");
    });
});
