import type { LinkedList } from "@r47onfire/game-math";
import type { CSTNode } from "@r47onfire/nebula";
import { undefinedToNull } from "lib0/conditions";
import { BTypeError, NotImplementedError, type StackTreeNode } from "../errors";
import {
    Builtin,
    type Callable,
    type CallableObject,
    type Signature,
} from "../obj";
import { doargs } from "./doargs";
import type { Env } from "./env";
import { type TryCatchHandler, handleError } from "./trycatch";
import type { Task, TaskGen } from "./vm";

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
        ? // Conditional hack because Typescript doesn't like boolean to a function that's
          // overloaded with one overload true and the other overload false.
          yield* doargs(task, env, traceback, handlers, sig, args, true)
        : yield* doargs(task, env, traceback, handlers, sig, args, false);
    // Flatten the __call__ chain to the Builtin at the bottom, and
    // call its Javascript implementation. A raw function joins in through
    // its __call__ Builtin stub. Stepping from an object to its __call__
    // keeps the object as the receiver, so a __call__ that is a plain method
    // still sees its object as `this`.
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
