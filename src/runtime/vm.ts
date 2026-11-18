import {
    EventDispatcher,
    insertionSort,
    LinkedList,
} from "@r47onfire/game-math";
import { CSTNode, Memo } from "@r47onfire/nebula";
import { BaseBackolonError, BTypeError } from "../errors";
import { StackTreeNode } from "../errors/compress";
import { Builtin, Signature } from "../obj/builtin_function";
import { Callable, isWrapper, WrapperClass } from "../obj/protocol";
import { backolonGrammar } from "../parser";
import { BackolonAuditEvents } from "./audit";
import { callValue } from "./call";
import { Env } from "./env";
import { Importer } from "./modules/importer";
import { Module } from "./modules/module";
import { TaskEvents } from "./taskEvents";
import { handleError, TryCatchHandler } from "./trycatch";

/**
 * The standardized call shape for grammar entries: a form handler is a Callable
 * whose one argument is the form being evaluated. The environment and the rest
 * of the context reach it the same way they reach every callable -- as the
 * shared context parameters of the call itself (see {@link BuiltinFunc} in
 * obj/protocol).
 */
export type FormFunc = Callable<Signature<["node"]>, any>;

export type TaskGen<T> = Generator<PromiseLike<any>, T, any>;

/**
 * The Backolon thread dispatcher: on top of the base VM it keeps the module
 * cache, and the current grammar (if any).
 */
export class BackolonVM extends EventDispatcher<BackolonAuditEvents> {
    builtins: Module;
    constructor(public importer: Importer) {
        super();
    }
    modules: Record<string, Module> = {};
    getModule(resolved: URL) {
        return this.modules[resolved.href];
    }
    createAndCacheModule(name: URL, parent: Module | null) {
        return (this.modules[name.href] = new Module(
            [this.builtins],
            name,
            parent,
        ));
    }
    /** List of tasks, sorted by priority. */
    #tasks: Task[] = [];
    addTask(
        id: string,
        priority: number,
        form: CSTNode<any>,
        env: Env,
        exclusive = false,
    ): Task {
        if (exclusive) {
            const t2 = this.#tasks.find((t) => t.id === id);
            if (t2) return t2;
        }
        const t = new Task(this, id, priority);
        t.gen = t.eval(form, env, null, null, []);
        this.#tasks.push(t);
        insertionSort(this.#tasks, (t1, t2) => t2.priority - t1.priority);
        return t;
    }
    /**
     * Evaluate a form to completion on an ad-hoc task and return its value,
     * synchronously. The evaluation must not yield a promise: if it does, it
     * has gone async, and this throws -- use {@link callAsync} for evaluations
     * that may await host operations.
     */
    call(form: CSTNode<any>, env: Env): any {
        const task = this.#callTask(form, env);
        task.step();
        if (!task.done) {
            throw new Error("call() task didn't finish");
        }
        return task.result;
    }
    /**
     * Evaluate a form to completion on an ad-hoc task, awaiting each promise it
     * yields as it settles, and return a promise for its value.
     */
    async callAsync(form: CSTNode<any>, env: Env): Promise<any> {
        const task = this.#callTask(form, env);
        while (!task.done) {
            if (task.isRunnable()) task.step();
            else await task.awaiting;
        }
        return task.result;
    }
    /** A throwaway task evaluating one form, for {@link call}/{@link callAsync}. */
    #callTask(form: CSTNode<any>, env: Env): Task {
        const task = new Task(this, "call", 0);
        task.gen = task.eval(form, env, null, null, []);
        return task;
    }
    /**
     * Step the highest-priority tasks that are not waiting on a promise. Does
     * not actually return any result for a task.
     *
     * @returns True if any work was done.
     */
    runAll(): boolean {
        let top: number | undefined = undefined,
            working = false;
        for (let i = 0; i < this.#tasks.length; i++) {
            const task = this.#tasks[i]!;
            if (task.done) {
                this.#tasks.splice(i--, 1);
                continue;
            }
            if (!task.isRunnable()) continue;
            if (top === undefined) top = task.priority;
            else if (task.priority < top) break;
            try {
                working = true;
                task.step();
            } catch {
                // already reported through the task's `error` event
            }
        }
        return working;
    }
    /**
     * Calls `await Promise.resolve()` at least twice, in order to force
     * recently-resolved promises to run their handlers and start up a suspended
     * task.
     */
    async waitForAll(): Promise<void> {
        // Force at least 2 loops so that fast promises can
        // flush in between loops
        for (let i = 0; i < 2; i++) {
            await Promise.resolve();
            if (this.runAll()) i = 0;
        }
    }
}

const enum ResumeStatus {
    NOT_WAITING,
    SUCCESS_VALUE,
    ERROR_VALUE,
}

export class Task extends EventDispatcher<TaskEvents> {
    grammar = backolonGrammar;
    memo: Memo<any> = {};
    gen!: TaskGen<any>;
    constructor(
        readonly vm: BackolonVM,
        readonly id: string,
        readonly priority: number,
    ) {
        super();
    }
    /** Whether the task's generator has returned or thrown. */
    done = false;
    /** The task's return value, once it has finished. */
    result: any = undefined;
    /**
     * The settlement of the promise the task last yielded, waiting to be
     * delivered into the generator at its next step: a fulfillment becomes the
     * yield expression's value, a rejection is thrown in at the yield point.
     * Boxed either way, so a promise that settles with `undefined` still counts
     * as settled.
     */
    #resumeValue: any;
    #resumeStatus = ResumeStatus.NOT_WAITING;
    /**
     * Resolves once the promise the task is currently parked on has settled;
     * `undefined` while the task is not parked (which only occurs if you're
     * driving the task manually).
     */
    awaiting: Promise<void> | undefined = undefined;
    /** Whether the task can be stepped right now: not finished, not parked. */
    isRunnable(): boolean {
        return !this.done && this.awaiting === undefined;
    }
    /**
     * Advance the task by one step: resume its generator, delivering the
     * settlement of the promise it last yielded (see {@link #resume}), and run
     * it until it yields its next promise or finishes. Finishing records
     * {@link result} and emits the task's `finish` event with the return value;
     * an error escaping the generator emits `error` and is rethrown. Does
     * nothing if the task is done or still parked on a promise.
     */
    step(): void {
        if (!this.isRunnable()) return;
        const value = this.#resumeValue;
        const status = this.#resumeStatus;
        this.#resumeValue = undefined;
        this.#resumeStatus = ResumeStatus.NOT_WAITING;
        let outcome: IteratorResult<PromiseLike<any>, any>;
        try {
            outcome =
                status === ResumeStatus.ERROR_VALUE
                    ? this.gen.throw(value)
                    : this.gen.next(value);
        } catch (e) {
            this.done = true;
            this.emit("error", e as BaseBackolonError);
            throw e;
        }
        if (outcome.done) {
            this.done = true;
            this.result = outcome.value;
            this.emit("finish", outcome.value);
        } else {
            this.#park(outcome.value);
        }
    }
    /** Park the task on a yielded promise until it settles. */
    #park(promise: PromiseLike<any>): void {
        this.awaiting = Promise.resolve(promise).then(
            (value) => {
                this.#resumeValue = value;
                this.#resumeStatus = ResumeStatus.SUCCESS_VALUE;
                this.awaiting = undefined;
            },
            (error) => {
                this.#resumeValue = error;
                this.#resumeStatus = ResumeStatus.ERROR_VALUE;
                this.awaiting = undefined;
            },
        );
    }
    /**
     * Evaluate a form: call its grammar entry's run handler through
     * {@link callValue}, then unwrap the result on the way out. A value
     * carrying an `__unwrap__` is a wrapper; unless it is an instance of one of
     * the wrapper classes the caller is prepared to receive, it is replaced by
     * its unwrapped value -- itself called through callValue, since
     * `__unwrap__` is a {@link Callable} -- and the replacement is checked the
     * same way, so nested wrappers all come off.
     */
    *eval(
        form: CSTNode<any>,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        wrappers: WrapperClass[],
    ): TaskGen<any> {
        const rule = this.grammar[form.type];
        if (!rule || !rule.run) {
            return yield* handleError(
                this,
                env,
                traceback,
                handlers,
                new BTypeError("backolon.eval.unknown_cst_type", form),
            );
        }
        let x = yield* callValue(
            this,
            env,
            traceback,
            handlers,
            rule.run,
            rule,
            [form],
            true,
        );
        while (isWrapper(x) && !wrappers.some((cls) => x instanceof cls)) {
            x = yield* callValue(
                this,
                env,
                traceback,
                handlers,
                x.__unwrap__,
                x,
                [],
                true,
            );
        }
        return x;
    }
}

/**
 * Determine a callable's signature: the signature of the callable itself, and
 * of nothing else. A Builtin carries its signature directly; a duck-typed
 * callable is asked through its `__signature__` (itself called through
 * {@link callValue}); anything else with no signature is an error.
 *
 * The lookup deliberately does not unwrap `__call__` layers looking for a
 * signature to borrow: a callable's declared signature is its calling contract,
 * and it is the contract of the exact value the caller named. If that value's
 * `__call__` leads to a callable whose own parameters disagree with the
 * declared signature, the value is simply misdeclared -- the call proceeds
 * under the declared contract, and the implementation receives whatever that
 * produces. A layer that forwards to another callable and wants to be called
 * must declare the resulting signature itself.
 */
export function* getSignature<P extends Signature>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    callee: Callable<P, any>,
): TaskGen<P> {
    if (callee instanceof Builtin) return callee.signature;
    if (typeof callee?.__signature__ !== "undefined") {
        return yield* callValue(
            task,
            env,
            traceback,
            handlers,
            callee.__signature__,
            callee,
            [],
        );
    }
    return (yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.call.no_signature", callee),
    )) as P;
}
