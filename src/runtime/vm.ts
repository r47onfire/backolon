import {
    EventDispatcher,
    insertionSort,
    LinkedList,
    LinkedList_toArray,
} from "@r47onfire/game-math";
import { CSTNode, Memo } from "@r47onfire/nebula";
import { BTypeError, NotImplementedError } from "../errors";
import { StackTreeNode } from "../errors/compress";
import { Builtin } from "../obj/builtin_function";
import {
    Callable,
    CallableObject,
    isWrapper,
    WrapperClass,
} from "../obj/protocol";
import { Signature } from "../obj/builtin_function";
import { backolonGrammar } from "../parser";
import { Identifier, objectEntries } from "../utils";
import { BackolonAuditEvents } from "./audit";
import { Env } from "./env";
import { Importer } from "./modules/importer";
import { Module } from "./modules/module";
import { TryCatchHandler } from "./trycatch";

/**
 * The standardized call shape for grammar entries: a form handler is a Callable
 * whose one argument is the form being evaluated. The environment and the rest
 * of the context reach it the same way they reach every callable -- as the
 * shared context parameters of the call itself (see {@link BuiltinFunc} in
 * obj/protocol).
 */
export type FormFunc = Callable<[form: CSTNode<any>], any>;

export type TaskGen<T> = Generator<PromiseLike<unknown>, T, any>;

/**
 * The Backolon thread dispatcher: on top of the base VM it keeps the module
 * cache, and the current grammar (if any).
 */
export class BackolonVM extends EventDispatcher<BackolonAuditEvents> {
    constructor(public importer: Importer) {
        super();
    }
    modules: Record<string, Module> = {};
    getModule(resolved: URL) {
        return this.modules[resolved.href];
    }
    createModule(name: URL, parent: Module | null) {
        return (this.modules[name.href] = new Module(name, parent));
    }
    /** List of tasks, sorted by priority. */
    tasks: Task[] = [];
    addTask(
        id: string,
        priority: number,
        form: CSTNode<any>,
        context: Record<Identifier, any>,
        exclusive = false,
    ): Task {
        if (exclusive) {
            const t2 = this.tasks.find((t) => t.id === id);
            if (t2) return t2;
        }
        const t = new Task(this, id, priority);
        const env = new Env(
            [this.builtinsEnv],
            new Map(objectEntries(context)),
        );
        t.gen = t.eval(form, env, null, null, null);
        this.tasks.push(t);
        insertionSort(this.tasks, (t1, t2) => t2.priority - t1.priority);
        return t;
    }
}

export class Task {
    grammar = backolonGrammar;
    memo: Memo<any> = {};
    gen!: TaskGen<any>;
    constructor(
        readonly vm: BackolonVM,
        readonly id: string,
        readonly priority: number,
    ) {}
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
        wrappers: LinkedList<WrapperClass>,
    ): TaskGen<any> {
        let x = yield* callValue(
            this,
            env,
            traceback,
            handlers,
            wrappers,
            this.grammar[form.type]?.run,
            [form],
            true,
        );
        while (
            isWrapper(x) &&
            !LinkedList_toArray(wrappers).some((cls) => x instanceof cls)
        ) {
            x = yield* callValue(
                this,
                env,
                traceback,
                handlers,
                wrappers,
                x.__unwrap__,
                [],
                true,
            );
        }
        return x;
    }
}

/**
 * Determine a callable's signature. The outermost layer that declares one wins:
 * a Builtin carries its signature directly, a duck-typed callable is asked
 * through its **signature** (itself called through {@link callValue}), and a
 * layer that declares neither is unwrapped through its `__call__` and the
 * search retries one level down. A callable with no signature anywhere in its
 * chain is an error: a layer that transforms its arguments is responsible for
 * declaring the signature of the result.
 */
export function* getSignature<P extends any[]>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    wrappers: LinkedList<WrapperClass>,
    handler: Callable<P, any>,
): TaskGen<Signature<P>> {
    let current: unknown = handler;
    while (true) {
        if (current instanceof Builtin) return current.signature;
        if (
            current !== null &&
            (typeof current === "object" || typeof current === "function")
        ) {
            const sig = (current as CallableObject<P, any>).__signature__;
            if (sig !== undefined) {
                return yield* callValue(
                    task,
                    env,
                    traceback,
                    handlers,
                    wrappers,
                    sig,
                    [],
                    true,
                );
            }
            const call = (current as CallableObject<P, any>).__call__;
            if (call !== undefined) {
                current = call;
                continue;
            }
        }
        throw new BTypeError("backolon.call.no_signature", handler);
    }
}

export function callValue<P extends any[], R>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    wrappers: LinkedList<WrapperClass>,
    handler: Callable<P, R> | undefined,
    args: P,
    computed?: false,
): TaskGen<R>;
export function callValue<P extends any[], R>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    wrappers: LinkedList<WrapperClass>,
    handler: Callable<P, R> | undefined,
    args: P,
    computed: true,
): TaskGen<R>;
export function* callValue<P extends any[], R>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    wrappers: LinkedList<WrapperClass>,
    callee: Callable<P, R> | undefined,
    args: P,
    computed?: boolean,
): TaskGen<R> {
    if (callee === undefined) {
        // in practice: a grammar node type with no run handler yet
        throw new NotImplementedError("backolon.call.no_handler");
    }
    let finalArgs: any[] = args;
    if (!computed) {
        // The args are still raw forms, so the callee's signature
        // decides what happens to each one: a lazy parameter binds
        // the form itself, any other parameter binds the form's
        // value, evaluated here in the caller's context. (Binding
        // the resulting values into the callee's scope, defaults
        // included, is the callee's business.)
        const sig = yield* getSignature(
            task,
            env,
            traceback,
            handlers,
            wrappers,
            callee,
        );
        const params = sig.params as unknown as (typeof sig.rest)[];
        finalArgs = [];
        for (let i = 0; i < args.length; i++) {
            const param = i < params.length ? params[i] : sig.rest;
            finalArgs.push(
                param?.lazy
                    ? args[i]
                    : yield* task.eval(
                          args[i],
                          env,
                          traceback,
                          handlers,
                          wrappers,
                      ),
            );
        }
    }
    // Flatten the __call__ chain to the Builtin at the bottom, and
    // call its Javascript implementation. A raw function joins in through
    // its __call__ getter, which manufactures its Builtin. Stepping from
    // an object to its __call__ keeps the object as the receiver, so a
    // __call__ that is a plain method still sees its object as `this`.
    let current: unknown = callee;
    let receiver: unknown = undefined;
    while (true) {
        if (current instanceof Builtin) {
            const result: unknown = Reflect.apply(current.func, receiver, [
                task,
                env,
                traceback,
                handlers,
                wrappers,
                ...finalArgs,
            ]);
            if (
                result !== null &&
                (typeof result === "object" || typeof result === "function")
            ) {
                if (typeof (result as PromiseLike<unknown>).then === "function")
                    return yield result as PromiseLike<unknown>;
                if (typeof (result as TaskGen<R>).next === "function")
                    return yield* result as TaskGen<R>;
            }
            return result as R;
        }
        if (
            current !== null &&
            (typeof current === "object" || typeof current === "function")
        ) {
            const call = (current as CallableObject<P, R>).__call__;
            if (call !== undefined) {
                if (typeof current !== "function") receiver = current;
                current = call;
                continue;
            }
        }
        throw new BTypeError("backolon.call.not_callable", callee);
    }
}
