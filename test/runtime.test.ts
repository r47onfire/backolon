import { expect, spyOn, test } from "bun:test";
import { boxNumber, BUILTIN_ENV, BUILTIN_FUNCTIONS, Scheduler } from "../src";
import { F, L } from "./astCheck";

test("roundtrip", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s.startTask(1, "a + 1", null, F);
    const s2 = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s2.loadFromSerialized(s.serializeTasks());
    expect(s2).toEqual(s);
});
test("print", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s.startTask(1, "print 'PASSED 1'; print (print 'PASSED 2')", null, F);
    const stdout = spyOn(console, "log");
    s.stepUntilSuspended();
    expect(stdout).toHaveBeenCalledTimes(3);
    expect(stdout).toHaveBeenNthCalledWith(1, "PASSED 1");
    expect(stdout).toHaveBeenNthCalledWith(2, "PASSED 2");
    expect(stdout).toHaveBeenNthCalledWith(3, "nil");
});
test("trivial return value", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    const t = s.startTask(1, "123\n", null, F);
    s.stepUntilSuspended();
    expect(t.stack).toBeEmpty();
    expect(t.result).toEqual(boxNumber(123, L));
});
