import {
    EventDispatcher,
    insertionSort,
    LinkedList,
} from "@r47onfire/game-math";
import { CSTNode, Memo } from "@r47onfire/nebula";
import { BTypeError } from "../errors";
import { StackTreeNode } from "../errors/compress";
import { Builtin, Signature } from "../obj/builtin_function";
import { Callable, isWrapper, WrapperClass } from "../obj/protocol";
import { backolonGrammar } from "../parser";
import { BackolonAuditEvents } from "./audit";
import { callValue } from "./call";
import { Env } from "./env";
import { Importer } from "./modules/importer";
import { Module } from "./modules/module";
import { handleError, TryCatchHandler } from "./trycatch";

/**
 * The standardized call shape for grammar entries: a form handler is a Callable
 * whose one argument is the form being evaluated. The environment and the rest
 * of the context reach it the same way they reach every callable -- as the
 * shared context parameters of the call itself (see {@link BuiltinFunc} in
 * obj/protocol).
 */
export type FormFunc = Callable<Signature<["node"]>, any>;

export type TaskGen<T> = Generator<PromiseLike<unknown>, T, any>;

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
    tasks: Task[] = [];
    addTask(
        id: string,
        priority: number,
        form: CSTNode<any>,
        env: Env,
        exclusive = false,
    ): Task {
        if (exclusive) {
            const t2 = this.tasks.find((t) => t.id === id);
            if (t2) return t2;
        }
        const t = new Task(this, id, priority);
        t.gen = t.eval(form, env, null, null, []);
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
    throw new BTypeError("backolon.call.no_signature", callee);
}
