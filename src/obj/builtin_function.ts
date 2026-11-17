import { LinkedList } from "@r47onfire/game-math";
import { CSTNode } from "@r47onfire/nebula";
import { StackTreeNode } from "../errors";
import { Env, Task, TaskGen } from "../runtime";
import { TryCatchHandler } from "../runtime/trycatch";
import { AnyTuple, Identifier, Tuple } from "../utils";

/**
 * A real function, ready to be wrapped in a {@link Builtin}: it is called with
 * the task, the shared context every callable receives (the environment, and
 * the traceback and handler stacks), and then the call's own arguments. See
 * {@link Signature} for the order the arguments are passed.
 *
 * Note that a builtin function that is meant to _return_ a generator to be
 * usable by Backolon code, must instead return the generator _from_ another
 * generator or promise. This is because any generator-like return value will be
 * interpreted as a {@link TaskGen}, and if it is directly returned, the values
 * it yields will be exhausted and fed back into it immediately by the TaskGen
 * driver loop, instead of letting the Backolon code use it.
 */
export type BuiltinFunc<P extends Signature, R = unknown> = (
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    ...args: SignatureToParameters<P>
) => TaskGen<R> | PromiseLike<R> | R;

/**
 * A real function wrapped up as a Callable, together with the signature its
 * calls are bound and evaluated against. This is the bottom of every `__call__`
 * chain: {@link callvalue} unwraps layers of duck-typed callables until it
 * reaches a Builtin, and the Builtin's function is the one real function it
 * calls. A Builtin carries its signature directly, rather than behind a
 * `__signature__` callable: signature lookup checks for a Builtin first.
 */
export class Builtin<P extends Signature, R = unknown> {
    constructor(
        /** @see {@link BuiltinFunc} */
        readonly func: BuiltinFunc<P, R>,
        /** @see {@link Signature} */
        readonly signature: P,
    ) {}
    *run(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        thisArg: any,
        realArgs: Tuple<any, SignatureToParameters<P>["length"]>,
    ): TaskGen<R> {
        const result = Reflect.apply(this.func, thisArg, [
            task,
            env,
            traceback,
            handlers,
            ...realArgs,
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
}

/**
 * How a parameter's argument is supplied to it: a "normal" parameter binds the
 * argument's value; a "lazy" parameter (a macro parameter) binds the argument's
 * raw form, unevaluated; a "block" parameter binds the argument's form wrapped
 * as a block -- a callable that evaluates the form in the caller's scope when
 * invoked. A lazy or block parameter cannot be given an already-computed
 * value.
 */
export type ParamKind = "normal" | "lazy" | "block";

/**
 * One parameter of a {@link Signature}: one field of the call's argument record,
 * destructured into the callee's scope when the call is bound.
 */
export interface SignatureParam {
    kind: ParamKind;
    /** True if the parameter is optional */
    opt?: boolean;
    /**
     * The form that fills the parameter when no argument is given, processed
     * the same way an argument would be: evaluated for a normal parameter,
     * bound as-is for a lazy one, wrapped as a block for a block one. Only
     * meaningful when {@link SignatureParam.opt} is true.
     */
    defaultForm?: CSTNode<any>;
}

/**
 * How a callable takes its arguments: although it isn't actually implemented
 * that way for performance reasons, for all intents and purposes a call is
 * always passed a single mixed-positional-and-keyword collection/record, and
 * the signature destructures its values into into the named parameters.
 *
 * Positional arguments fill the {@link head} parameters from the front of the
 * argument list and the {@link tail} parameters from the back; whatever is left
 * between them goes to the {@link posRest} parameter, and keyword arguments fill
 * (non-rest) parameters by name, with whatever is left over going to the
 * {@link kwRest} parameter. If it's not possible to put an argument somewhere
 * (e.g. too many arguments when there isn't a positional rest parameter), an
 * error is thrown.
 *
 * The signature also drives evaluation: when a call's arguments are still raw
 * forms, {@link callValue} processes each one according to its parameter's
 * {@link ParamKind}.
 *
 * {@link callValue} passes the callee the bound values in the order: head
 * values, the positional rest collection, tail values, and the keyword rest
 * record.
 */
export interface Signature<
    H extends Identifier[] = Identifier[],
    P extends Identifier = Identifier,
    T extends Identifier[] = Identifier[],
    K extends Identifier = Identifier,
> {
    /** Lookup table mapping name to actual parameter metadata. */
    byName: Record<H[number] | P | T[number] | K, SignatureParam>;
    /** The parameters anchored to the start of the call site. */
    head: H;
    /** Binds the positional arguments left between head and tail. */
    posRest?: P;
    /** The parameters anchored to the start of the call site. */
    tail: T;
    /** Binds the keyword arguments no named parameter claimed. */
    kwRest?: K;
    /** Closure env for creating the dynamic scope for evaluating defaults in. */
    closureEnv?: Env;
}

export type SignatureToParameters<T extends Signature> =
    T extends Signature<infer H, infer P, infer T, infer K>
        ? [
              ...AnyTuple<H, unknown>,
              ...([P] extends [never] ? [] : [unknown[]]),
              ...AnyTuple<T, unknown>,
              ...([K] extends [never] ? [] : [Record<K, unknown>]),
          ]
        : never;

/** The signature of a callable that takes no arguments at all. */
export const NO_ARGS_SIG: Signature<[], never, [], never> = {
    head: [],
    tail: [],
    byName: {},
};

/**
 * The signature of a binary operator: one positional parameter, `arg` (the
 * other side is passed as the `this` value).
 */
export const ONE_ARG_SIG: Signature<["arg"], never, [], never> = {
    head: ["arg"],
    tail: [],
    byName: { arg: { kind: "normal" } },
};

/**
 * The signature of a raw function, called through its `__call__`: every
 * argument is collected into the `arguments` positional rest parameter.
 */
export const ARGUMENTS_SIG: Signature<[], "arguments", [], never> = {
    head: [],
    tail: [],
    posRest: "arguments",
    byName: { arguments: { kind: "normal" } },
};
