import { LinkedList } from "@r47onfire/game-math";
import { CSTNode } from "@r47onfire/nebula";
import { undefinedToNull } from "lib0/conditions";
import { BTypeError, NotImplementedError, StackTreeNode } from "../errors";
import { Builtin, Callable, CallableObject, Signature } from "../obj";
import { Identifier, objectEntries } from "../utils";
import { Env } from "./env";
import { TryCatchHandler } from "./trycatch";
import { Task, TaskGen, getSignature } from "./vm";
import { handleError } from "./trycatch";

export const BLOCK_SIG: Signature<[], "injected", [], never> = {
    byName: { injected: { kind: "normal" } },
    head: [],
    posRest: "injected",
    tail: [],
};

/**
 * Wrap one or more unevaluated forms as a block: a callable that evaluates them
 * in order, in the environment they were written in, and returns the last one's
 * value.
 */
export const makeBlock = (
    forms: CSTNode<any>[],
    closureEnv: Env,
): Builtin<typeof BLOCK_SIG, any> =>
    new Builtin<typeof BLOCK_SIG, any>(function* (
        task,
        _callerEnv,
        traceback,
        handlers,
        injected,
    ) {
        let env = closureEnv;
        if (injected.length > 0) {
            const newscope = new Map<Identifier, any>();
            for (let i = 0; i < injected.length; i++) {
                let item = injected[i];
                for (;;) {
                    if (item instanceof Map) {
                        for (let { 0: key, 1: value } of item.entries())
                            newscope.set(key, value);
                        break;
                    } else if (typeof item === "object" && item !== null) {
                        const e = objectEntries(
                            item as Record<Identifier, any>,
                        );
                        for (let j = 0; j < e.length; j++)
                            newscope.set(e[j]![0], e[j]![1]);
                        break;
                    } else {
                        item = yield* handleError(
                            task,
                            env,
                            traceback,
                            handlers,
                            new BTypeError("backolon.block.not_a_mapping"),
                        );
                    }
                }
            }
            if (newscope.size > 0) env = new Env([env], newscope);
        }
        let result: any = null;
        for (const form of forms) {
            result = yield* task.eval(form, env, traceback, handlers, []);
        }
        return result;
    }, BLOCK_SIG);

/**
 * Bind a call's given arguments against the callee's signature and return the
 * bound values in signature order. Given arguments are processed one by one
 * according to their parameter's kind; defaults fill whatever is left.
 *
 * @see {@link Signature}
 */
function doargs<P extends Signature, R>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    sig: P,
    args: CSTNode<any>[],
    computed?: false,
): TaskGen<any[]>;
function doargs<P extends Signature, R>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    sig: P,
    args: any[],
    computed: true,
): TaskGen<any[]>;
function* doargs<P extends Signature, R>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    sig: P,
    args: any[],
    computed?: boolean,
): TaskGen<any[]> {
    // TODO: args and kwargs can be mixed positional/keyword, and should be evaluated
    // in order if they are to be evaluated at all
}

export function callValue<P extends Signature, R>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    f: Callable<P, R> | undefined,
    thisArg: any,
    args: CSTNode<any>[],
    computed?: false,
): TaskGen<R>;
export function callValue<P extends Signature, R>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    f: Callable<P, R> | undefined,
    thisArg: any,
    args: any[],
    computed: true,
): TaskGen<R>;
export function* callValue<P extends Signature, R>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    f: Callable<P, R> | undefined,
    thisArg: any,
    args: any[],
    computed?: boolean,
): TaskGen<R> {
    if (undefinedToNull(f) === null) {
        return (yield* handleError(
            task,
            env,
            traceback,
            handlers,
            new NotImplementedError("backolon.call.no_handler"),
        )) as R;
    }
    const sig = yield* getSignature(task, env, traceback, handlers, f!);
    const finalArgs: any[] = computed
        ? yield* doargs(task, env, traceback, handlers, sig, args, true)
        : yield* doargs(task, env, traceback, handlers, sig, args, false);
    // Flatten the __call__ chain to the Builtin at the bottom, and
    // call its Javascript implementation. A raw function joins in through
    // its __call__ getter, which manufactures its Builtin. Stepping from
    // an object to its __call__ keeps the object as the receiver, so a
    // __call__ that is a plain method still sees its object as `this`.
    let current: unknown = f;
    let receiver: unknown = thisArg;
    for (;;) {
        if (current instanceof Builtin) {
            return yield* current.run(
                task,
                env,
                traceback,
                handlers,
                receiver,
                finalArgs,
            );
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
        return (yield* handleError(
            task,
            env,
            traceback,
            handlers,
            new BTypeError("backolon.call.not_callable", f),
        )) as R;
    }
}
