import { LinkedList } from "@r47onfire/game-math";
import { StackTreeNode } from "../errors";
import { Env, Task, TaskGen } from "../runtime";
import { TryCatchHandler } from "../runtime/trycatch";
import { WrapperClass } from "./protocol";
import { CSTNode } from "@r47onfire/nebula";
import { Identifier } from "../utils";

/**
 * A real function, ready to be wrapped in a {@link Builtin}: it is called with
 * the task, the shared context every callable receives (the environment, the
 * traceback and handler stacks, and the stack of wrapper classes the
 * surrounding code is prepared to receive), and then the call's own arguments.
 * This is the only function shape callValue ever calls directly.
 */
export type BuiltinFunc<P extends any[] = unknown[], R = unknown> = (
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    wrappers: LinkedList<WrapperClass>,
    ...args: P
) => TaskGen<R>;

/**
 * A real function wrapped up as a Callable, together with the signature its
 * calls are bound and evaluated against. This is the bottom of every `__call__`
 * chain: callValue unwraps layers of duck-typed callables until it reaches a
 * Builtin, and the Builtin's function is the one real function it calls. A
 * Builtin carries its signature directly, rather than behind a **signature**
 * callable: signature lookup checks for a Builtin first.
 */
export class Builtin<P extends any[] = unknown[], R = unknown> {
    constructor(
        readonly func: BuiltinFunc<P, R>,
        readonly signature: Signature<P>,
    ) {}
}

/**
 * One parameter of a {@link Signature}: one field of the call's argument record,
 * destructured into the callee's scope when the call is bound.
 */
export interface SignatureParam {
    name: Identifier;
    /** A macro parameter: it binds the argument's raw form, unevaluated. */
    lazy: boolean;
    hasDefault: boolean;
    /**
     * The form evaluated (in the caller's scope) when no argument is given; for
     * a lazy parameter the form itself is bound instead. Only meaningful when
     * {@link SignatureParam.hasDefault} is true.
     */
    defaultForm?: CSTNode<any>;
}

/**
 * How a callable takes its argument: a call passes a single record, and the
 * signature says how that record destructures into parameters when the call is
 * bound -- one descriptor per parameter of P, plus an optional rest parameter
 * for whatever is left over. The signature also drives evaluation: when a
 * call's arguments are still raw forms, callValue evaluates each one unless its
 * parameter is lazy.
 */
export interface Signature<P extends any[] = unknown[]> {
    params: {
        [K in keyof P]: SignatureParam;
    };
    /** Binds whatever the named params did not consume, or null. */
    rest: SignatureParam | null;
}
/** The signature of a callable that takes no arguments at all. */

export const emptySignature: Signature<[]> = { params: [], rest: null };
