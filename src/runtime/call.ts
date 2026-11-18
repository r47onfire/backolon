import { LinkedList } from "@r47onfire/game-math";
import { CSTNode } from "@r47onfire/nebula";
import { undefinedToNull } from "lib0/conditions";
import { BTypeError, NotImplementedError, StackTreeNode } from "../errors";
import { Builtin, Callable, CallableObject, Signature } from "../obj";
import { doargs } from "./doargs";
import { Env } from "./env";
import { TryCatchHandler, handleError } from "./trycatch";
import { Task, TaskGen, getSignature } from "./vm";

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
