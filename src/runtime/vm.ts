import {
    EventDispatcher,
    insertionSort,
    LinkedList,
    LinkedList_toArray,
} from "@r47onfire/game-math";
import { CSTNode, Memo } from "@r47onfire/nebula";
import { BTypeError, NotImplementedError } from "../errors";
import { StackTreeNode } from "../errors/compress";
import { Builtin, emptySignature, Signature } from "../obj/builtin_function";
import {
    Callable,
    CallableObject,
    isWrapper,
    WrapperClass,
} from "../obj/protocol";
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
export function* getSignature<P extends any[]>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    wrappers: LinkedList<WrapperClass>,
    handler: Callable<P, any>,
): TaskGen<Signature> {
    if (handler instanceof Builtin) return handler.signature;
    if (
        handler !== null &&
        (typeof handler === "object" || typeof handler === "function")
    ) {
        const sig = (handler as CallableObject<P, any>).__signature__;
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
    }
    throw new BTypeError("backolon.call.no_signature", handler);
}

// TODO: make this allow one optional parameter, a Record or Map, which injects variables
// into the env
/**
 * Wrap one or more unevaluated forms as a block: a callable that evaluates them
 * in order, in the environment they were written in, and returns the last one's
 * value.
 */
const makeBlock = (forms: CSTNode<any>[], closureEnv: Env): Builtin<[], any> =>
    new Builtin<[], any>(function* (
        task,
        _callerEnv,
        traceback,
        handlers,
        wrappers,
    ) {
        let result: any = null;
        for (const form of forms) {
            result = yield* task.eval(
                form,
                closureEnv,
                traceback,
                handlers,
                wrappers,
            );
        }
        return result;
    }, emptySignature);

/**
 * Bind a call's given arguments against the callee's signature and return the
 * bound values in signature order. Given arguments are processed one by one
 * according to their parameter's kind; defaults fill whatever is left.
 *
 * @see {@link Signature}
 */
function* bindArguments(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    wrappers: LinkedList<WrapperClass>,
    sig: Signature,
    args: any[],
    kwargEntries: [Identifier, any][],
    computed: boolean,
    callee: unknown,
): TaskGen<any[]> {
    // TODO: args and kwargs can be mixed positional/keyword, and should be evaluated
    // in order if they are to be evaluated at all
}

export function callValue<P extends any[], R>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    wrappers: LinkedList<WrapperClass>,
    callee: Callable<P, R> | undefined,
    args: P,
    computed?: false,
    kwargs?: Record<Identifier, any> | null,
): TaskGen<R>;
export function callValue<P extends any[], R>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    wrappers: LinkedList<WrapperClass>,
    callee: Callable<P, R> | undefined,
    args: P,
    computed: true,
    kwargs?: Record<Identifier, any> | null,
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
    kwargs?: Record<Identifier, any> | null,
): TaskGen<R> {
    if (callee === undefined) {
        // in practice: a grammar node type with no run handler yet
        throw new NotImplementedError("backolon.call.no_handler");
    }
    // The callee's signature governs the call: the given arguments are
    // bound against it (evaluated, passed raw, or wrapped as blocks,
    // per parameter kind; defaults filled; rests collected), and the
    // callee receives the bound values in signature order.
    const sig = yield* getSignature(
        task,
        env,
        traceback,
        handlers,
        wrappers,
        callee,
    );
    const finalArgs: any[] = yield* bindArguments(
        task,
        env,
        traceback,
        handlers,
        wrappers,
        sig,
        args,
        kwargs ? objectEntries(kwargs) : [],
        computed ?? false,
        callee,
    );
    // Flatten the __call__ chain to the Builtin at the bottom, and
    // call its Javascript implementation. A raw function joins in through
    // its __call__ getter, which manufactures its Builtin. Stepping from
    // an object to its __call__ keeps the object as the receiver, so a
    // __call__ that is a plain method still sees its object as `this`.
    let current: unknown = callee;
    let receiver: unknown = undefined;
    while (true) {
        if (current instanceof Builtin) {
            // TODO: move this to be a Builtin method
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
