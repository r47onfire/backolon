import { CSTNode, Span } from "@r47onfire/nebula";
import { describe, expect, test } from "bun:test";
import {
    BackolonVM,
    Env,
    Importer,
    IndexResolver,
    Task,
    TaskGen,
} from "../src";

const makeVM = () => new BackolonVM(new Importer(new IndexResolver(), []));

/** A complete span for hand-built forms: frames hash the span's file. */
const stubSpan = new Span(new URL("test:"), 0, 0, 0, 0, 0, 0);

/** A task with a hand-written generator */
const addGenTask = (
    vm: BackolonVM,
    id: string,
    priority: number,
    gen: TaskGen<any>,
): Task => {
    const task = vm.addTask(
        id,
        priority,
        new CSTNode<any>(stubSpan, "dummy"),
        new Env(),
    );
    task.gen = gen;
    return task;
};

describe("the task driver", () => {
    test("a yielded promise's resolution is fed into the next next() call", async () => {
        const vm = makeVM();
        const task = addGenTask(
            vm,
            "t",
            0,
            (function* () {
                const value = yield Promise.resolve(41);
                return value + 1;
            })(),
        );
        const finishes: any[] = [];
        task.on("finish", (v) => finishes.push(v));
        await vm.waitForAll();
        expect(task.done).toBeTrue();
        expect(task.result).toBe(42);
        expect(finishes).toEqual([42]);
    });

    test("the resolution flows through yield* delegation layers", async () => {
        // the shape Builtin.run produces: an inner generator yields the
        // promise, outer generators delegate with yield*
        function* inner(): TaskGen<any> {
            const item = yield Promise.resolve("sword");
            return `took the ${item}`;
        }
        function* outer(): TaskGen<any> {
            return yield* inner();
        }
        const vm = makeVM();
        const task = addGenTask(vm, "t", 0, outer());
        await vm.waitForAll();
        expect(task.result).toBe("took the sword");
    });

    test("a rejection is thrown in at the yield point, where it can be caught", async () => {
        const vm = makeVM();
        const task = addGenTask(
            vm,
            "t",
            0,
            (function* () {
                try {
                    yield Promise.reject(new Error("inventory full"));
                    return "not reached";
                } catch {
                    return "recovered";
                }
            })(),
        );
        const errors: any[] = [];
        task.on("error", (e) => errors.push(e));
        await vm.waitForAll();
        expect(task.result).toBe("recovered");
        expect(errors).toEqual([]);
    });

    test("an uncaught error emits `error` and does not stop the other tasks", async () => {
        const vm = makeVM();
        const boom = new Error("boom");
        const bad = addGenTask(
            vm,
            "bad",
            10,
            (function* () {
                yield Promise.resolve(1);
                throw boom;
            })(),
        );
        const good = addGenTask(
            vm,
            "good",
            1,
            (function* () {
                return yield Promise.resolve(7);
            })(),
        );
        const badErrors: any[] = [];
        bad.on("error", (e) => badErrors.push(e));
        await vm.waitForAll();
        expect(bad.done).toBeTrue();
        expect(badErrors).toEqual([boom]);
        expect(good.result).toBe(7);
    });

    test("a task parked on a slow promise does not block lower-priority tasks", async () => {
        const vm = makeVM();
        const slow = Promise.withResolvers<string>();
        const fast = Promise.withResolvers<string>();
        const high = addGenTask(
            vm,
            "high",
            10,
            (function* () {
                return yield slow.promise;
            })(),
        );
        const low = addGenTask(
            vm,
            "low",
            1,
            (function* () {
                return yield fast.promise;
            })(),
        );
        const order: string[] = [];
        high.on("finish", () => order.push("high"));
        low.on("finish", () => order.push("low"));
        await vm.waitForAll();
        expect(high.done).toBeFalse();
        expect(low.done).toBeFalse();
        fast.resolve("fast");
        await vm.waitForAll();
        expect(low.done).toBeTrue();
        expect(high.done).toBeFalse();
        slow.resolve("slow");
        await vm.waitForAll();
        expect(order).toEqual(["low", "high"]);
        expect(high.result).toBe("slow");
    });

    test("waitForAll with no tasks resolves, and is a no-op once all are done", async () => {
        const vm = makeVM();
        await vm.waitForAll();
        const task = addGenTask(
            vm,
            "t",
            0,
            (function* () {
                return 1;
            })(),
        );
        await vm.waitForAll();
        await vm.waitForAll();
        expect(task.result).toBe(1);
    });
});

describe("call/callAsync", () => {
    // Forms whose type the grammar does not know fail inside Task.eval
    // before any call is made.
    const unknownForm = new CSTNode<any>(stubSpan, "nope");

    test("call() propagates an evaluation error synchronously", () => {
        const vm = makeVM();
        expect(() => vm.call(unknownForm, new Env())).toThrow(
            "backolon.eval.unknown_cst_type",
        );
    });

    test("callAsync() rejects with an evaluation error", async () => {
        const vm = makeVM();
        expect(vm.callAsync(unknownForm, new Env())).rejects.toThrow(
            "backolon.eval.unknown_cst_type",
        );
    });
});
