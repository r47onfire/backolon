import { expect, test } from "bun:test";
import { BUILTIN_ENV, BUILTIN_FUNCTIONS, Scheduler } from "../dist/backolon.js";
import { F } from "./astCheck";

test("roundtrip", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s.startTask(1, "a + 1", null, F);
    const s2 = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s2.loadFromSerialized(s.serializeTasks());
    expect(s2).toEqual(s);
});
