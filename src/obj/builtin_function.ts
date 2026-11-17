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
        readonly signature: Signature,
    ) {}
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
    name: Identifier;
    kind: ParamKind;
    hasDefault: boolean;
    /**
     * The form that fills the parameter when no argument is given, processed
     * the same way an argument would be: evaluated for a normal parameter,
     * bound as-is for a lazy one, wrapped as a block for a block one. Only
     * meaningful when {@link SignatureParam.hasDefault} is true.
     */
    defaultForm?: CSTNode<any>;
}

/**
 * How a callable takes its arguments: a call passes a single record, and the
 * signature says how that record destructures into parameters when the call is
 * bound. Positional arguments fill the **head** parameters from the front of
 * the argument list and the **tail** parameters from the back; whatever is left
 * between them goes to the positional rest parameter, and keyword arguments
 * fill parameters by name (the keyword-only **byName** parameters, or a
 * head/tail parameter not already filled positionally), with whatever is left
 * over going to the keyword rest parameter.
 *
 * The signature also drives evaluation: when a call's arguments are still raw
 * forms, callValue processes each one according to its parameter's kind.
 * callValue passes the callee the bound values in the order: head values, the
 * positional rest collection, tail values, byName values in declaration order,
 * and the keyword rest record -- omitting whichever rests are not declared.
 */
export interface Signature {
    head: SignatureParam[];
    tail: SignatureParam[];
    byName: Record<Identifier, SignatureParam>;
    /** Binds the positional arguments left between head and tail. */
    posRest?: SignatureParam;
    /** Binds the keyword arguments no named parameter claimed. */
    kwRest?: SignatureParam;
    /** Closure env for creating the dynamic scope for evaluating defaults in. */
    closureEnv?: Env;
}
/** The signature of a callable that takes no arguments at all. */

export const emptySignature: Signature = { head: [], tail: [], byName: {} };
