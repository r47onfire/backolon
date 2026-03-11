import { expect, test } from "bun:test";
import { BUILTIN_ENV, BUILTIN_FUNCTIONS, Scheduler } from "../src";
import { F } from "./astCheck";

test("roundtrip", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s.startTask(1, "a + 1", null, F);
    const s2 = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s2.loadFromSerialized(s.serializeTasks());
    expect(s2).toEqual(s);
});
test("print", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s.startTask(1, "print 'PASS'", null, F);
    s.startTask(1, "print 1", null, F);
    s.stepUntilSuspended();
});
