import { LinkedList } from "@r47onfire/game-math";
import { StackTreeNode } from "../errors/compress";
import { Env, Task, TaskGen } from "../runtime";
import { TryCatchHandler } from "../runtime/trycatch";
import {
    Builtin,
    BuiltinFunc,
    emptySignature,
    Signature,
} from "./builtin_function";

/** A class of wrappers, as threaded through the evaluation context. */
export type WrapperClass = abstract new (...args: any[]) => Wrapper;

/**
 * A duck-typed callable: its `__call__` is another Callable, and its
 * **signature** says how a call to it is bound. Layers wrap layers until a
 * {@link Builtin} bottoms the chain out.
 */
export interface CallableObject<P extends any[] = unknown[], R = unknown> {
    __call__: Callable<P, R>;
    __signature__: Callable<[], Signature<P>>;
}

/**
 * Anything that can be called through callValue: either a duck-typed object
 * whose `__call__` is another Callable, or a {@link Builtin} wrapping a real
 * function. A raw function is not itself a Callable -- it joins the protocol
 * through its `__call__` property, a getter on Function.prototype that
 * manufactures a Builtin for it.
 */
export type Callable<P extends any[] = unknown[], R = unknown> =
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
        (task, env, traceback, handlers, wrappers) =>
            this.unwrap(task, env, traceback, handlers, wrappers),
        emptySignature,
    );
    constructor() {}
    protected abstract unwrap(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        wrappers: LinkedList<WrapperClass>,
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

// The operator protocols below are the raw host implementations:
// a dunder is a builtin function, not yet wrapped in a Builtin, and
// it reaches the call protocol through its function's __call__
// getter like any other raw function.
export interface Mathable {
    __add__: BuiltinFunc<[other: any], any>;
    __sub__: BuiltinFunc<[other: any], any>;
    __mul__: BuiltinFunc<[other: any], any>;
    __div__: BuiltinFunc<[other: any], any>;
    __matmul__?: BuiltinFunc<[other: any], any>;
    __rmatmul__?: BuiltinFunc<[other: any], any>;
}
export interface Negateable {
    __neg__: BuiltinFunc<[], any>;
}
export interface Absable {
    __abs__: BuiltinFunc<[], any>;
}

export interface ReflectedMathable extends Mathable {
    __radd__: BuiltinFunc<[other: any], any>;
    __rsub__: BuiltinFunc<[other: any], any>;
    __rmul__: BuiltinFunc<[other: any], any>;
    __rdiv__: BuiltinFunc<[other: any], any>;
}

export interface Comparable {
    __lt__?: BuiltinFunc<[other: any], boolean>;
    __gt__?: BuiltinFunc<[other: any], boolean>;
    __lte__?: BuiltinFunc<[other: any], boolean>;
    __gte__?: BuiltinFunc<[other: any], boolean>;
    __eq__?: BuiltinFunc<[other: any], boolean>;
    __ne__?: BuiltinFunc<[other: any], boolean>;
}
