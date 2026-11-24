import { LinkedList } from "@r47onfire/game-math";
import { StackTreeNode } from "../errors/compress";
import { callValue, type Env, type Task, type TaskGen } from "../runtime";
import { TryCatchHandler } from "../runtime/trycatch";
import {
    Builtin,
    NO_ARGS_SIG,
    ONE_ARG_SIG,
    Signature,
} from "./builtin_function";
import { BTypeError } from "../errors";

/** A class of wrappers, as threaded through the evaluation context. */
export type WrapperClass = abstract new (...args: any[]) => Wrapper;

/**
 * A duck-typed callable: its `__call__` is another Callable, and its
 * `__signature__` says how a call to it is bound. Layers wrap layers until a
 * {@link Builtin} bottoms the chain out.
 */
export interface CallableObject<P extends Signature, R = unknown> {
    __call__: Callable<P, R>;
    __signature__: Callable<Signature<[], never, [], never>, P>;
}

/**
 * Anything that can be called through callValue: either a duck-typed object
 * whose `__call__` is another Callable, or a {@link Builtin} wrapping a real
 * function. A raw function is not itself a Callable -- it joins the protocol
 * through its `__call__` property, a getter on Function.prototype that
 * manufactures a Builtin for it.
 */
export type Callable<P extends Signature<any> = Signature<never>, R = unknown> =
    CallableObject<P, R> | Builtin<P, R>;

/**
 * A value that wraps another value: produces the wrapped value from
 * {@link __unwrap__}. {@link Task.eval} unwraps every value it returns, unless
 * the wrapper is an instance of a wrapper class the caller is prepared to
 * receive.
 */
export abstract class Wrapper {
    /**
     * Produce the wrapped value, as a Callable in its own right: a Builtin
     * around the subclass's unwrapValue, so it keeps its wrapper when extracted
     * and passed to callValue on its own. A subclass may replace it with
     * another Callable after super().
     */
    readonly __unwrap__ = new Builtin(
        (task, env, traceback, handlers) =>
            this.unwrap(task, env, traceback, handlers),
        NO_ARGS_SIG,
    );
    constructor() {}
    protected abstract unwrap(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
    ): TaskGen<any>;
}

/**
 * Whether a value is a wrapper: it carries both a **tag** property and an
 * **unwrap**. The tag is a plain property, never computed, so probing a value
 * for wrapper-ness does not run code.
 */
export const isWrapper = (x: unknown): x is Wrapper =>
    x !== null &&
    (typeof x === "object" || typeof x === "function") &&
    "__unwrap__" in x;

// The operator protocols below: a dunder is a Builtin, called through
// callValue like any other Callable.
export interface Mathable {
    __add__: Callable<typeof ONE_ARG_SIG, any>;
    __sub__: Callable<typeof ONE_ARG_SIG, any>;
    __mul__: Callable<typeof ONE_ARG_SIG, any>;
    __div__: Callable<typeof ONE_ARG_SIG, any>;
    __matmul__?: Callable<typeof ONE_ARG_SIG, any>;
    __rmatmul__?: Callable<typeof ONE_ARG_SIG, any>;
}
export interface Negateable {
    __neg__: Callable<typeof NO_ARGS_SIG, any>;
}
export interface Absable {
    __abs__: Callable<typeof NO_ARGS_SIG, any>;
}

/** A value that can turn itself into a string, e.g. for interpolation. */
export interface Stringable {
    __str__: Callable<typeof NO_ARGS_SIG, string>;
}

export interface ReflectedMathable extends Mathable {
    __radd__: Callable<typeof ONE_ARG_SIG, any>;
    __rsub__: Callable<typeof ONE_ARG_SIG, any>;
    __rmul__: Callable<typeof ONE_ARG_SIG, any>;
    __rdiv__: Callable<typeof ONE_ARG_SIG, any>;
}

export interface Comparable {
    __lt__?: Callable<typeof ONE_ARG_SIG, boolean | typeof NotImplemented>;
    __gt__?: Callable<typeof ONE_ARG_SIG, boolean | typeof NotImplemented>;
    __lte__?: Callable<typeof ONE_ARG_SIG, boolean | typeof NotImplemented>;
    __gte__?: Callable<typeof ONE_ARG_SIG, boolean | typeof NotImplemented>;
    __eq__?: Callable<typeof ONE_ARG_SIG, boolean | typeof NotImplemented>;
    __ne__?: Callable<typeof ONE_ARG_SIG, boolean | typeof NotImplemented>;
}

export const NotImplemented = Symbol("NotImplemented");

export function* runBinaryMethod(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    op: string,
    left: any,
    right: any,
) {
    const method = `__${op}__`;
    const reflectedMethod = `__r${op}__`;

    let result = left[method] ? yield* callValue(task, env, traceback, handlers, left[method], left, [right], true) : NotImplemented;
    if (result != NotImplemented) return result;
    result = right[reflectedMethod] ? yield* callValue(task, env, traceback, handlers, right[reflectedMethod], right, [left], true) : NotImplemented;
    if (result != NotImplemented) return result;
    throw new BTypeError("backolon.operator.wrong_type.binary", [op, left, right]);
}
