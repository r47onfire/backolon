import { stringify } from "lib0/json";
import { forEach } from "lib0/object";
import { BackolonError, LocationTrace, RuntimeError, UNKNOWN_LOCATION } from "../errors";
import { mapGetKey, mapUpdateKeyMutating, newEmptyMap } from "../objects/map";
import { boxApply, boxList, boxNameSymbol, boxNil, isAtom, isBlock, isSymbol, Thing, ThingType, typecheck, typeNameOf } from "../objects/thing";
import { matchPattern } from "../patterns/match";
import { flatToVarMap, newEnv, walkEnvTree } from "./env";
import { getNthDescriptor, getParamDescriptors, isLazy, parametersToVars, wrapImplicitBlock } from "./functor";
import { type Scheduler } from "./scheduler";

/**
 * @file
 * @module Builtins
 */

/**
 * Flags used to record internal task evaluation state.
 */
export enum StackFlag {
    /**
     * Normally, a native function is treated as a value and returned; however,
     * when one is called it needs to be the {@link StackFrame#value|value} of the
     * {@link StackFrame} it's in so that its arguments can be processed. That stack has this
     * flag set to mark that it's actually being called and not just returned.
     */
    native_func_being_evaluated = 1,
    /**
     * Flag used to indicate that a stack frame has been pushed as a result of a continuation switching stacks.
     */
    via_continuation_switch = 2,
    /**
     * Frame is the enter callback of a `with` construct and should be left
     * on the stack to be called when a continuation jumps "in".
     */
    on_enter = 4,
    /**
     * Frame is the exit callback of a `with` construct and should be left
     * on the stack to be called when a continuation jumps "out" or we're returning normally.
     */
    on_exit = 8,
}

/**
 * A single stack frame in the Backolon evaluator.
 */
export class StackFrame {
    constructor(
        /** current value being evaluated */
        public readonly value: Thing,
        /** location trace */
        public readonly loc: LocationTrace,
        /** arguments in-progress being evaluated */
        public readonly argv: readonly Thing[],
        /** current environment */
        public readonly env: Thing<ThingType.env> | Thing<ThingType.nil>,
        /** resolved name of the stack frame if it is determined to be significant */
        public readonly name: string | null,
        /** current index in evaluating args */
        public readonly index = 0,
        /** internal state for evaluation */
        public readonly cookie: number = 0,
        /** arbitrary data */
        public readonly data: any = null,
        /** state flags */
        public readonly flags = 0,
    ) { }
    sd(index: number, state: number, data: any) {
        return new StackFrame(this.value, this.loc, this.argv, this.env, this.name, index, state, data, this.flags);
    }
    g(args: Thing[]) {
        return new StackFrame(this.value, this.loc, args, this.env, this.name, this.index, this.cookie, this.data, this.flags);
    }
    f(toSet: number, toClear: number) {
        return new StackFrame(this.value, this.loc, this.argv, this.env, this.name, this.index, this.cookie, this.data, (this.flags & (~toClear)) | toSet);
    }
    e(newEnv: Thing<ThingType.env>) {
        return new StackFrame(this.value, this.loc, this.argv, newEnv, this.name, this.index, this.cookie, this.data, this.flags);
    }
}

enum BlockEvalState {
    initial = 0,
    matching_patterns,
    evaluating_body_after_no_matches_found,
    waiting_for_pattern_result,
}

enum ApplyEvalState {
    initial = 0,
    waiting_for_functor_result,
    evaluate_arguments,
    waiting_for_arg_result,
}

/**
 * Represents a running Backolon evaluation task.
 */
export class Task {
    /**
     * Whether this task is currently suspended (e.g. waiting for a promise to resolve).
     * If true, the scheduler will not run this task until it is resumed by setting suspended to false.
     */
    suspended = false;
    stack: readonly StackFrame[] = [];
    /**
     * Represents the result of the last evaluated expression, used for returning values to whatever started this task.
     */
    result: Thing | null = null;
    /**
     * If true, the current frame has failed with an error value. The error is stored in result.
     * If a frame doesn't have handles_error or on_exit set, the error will propagate up the stack.
     */
    failed = false;
    constructor(public priority: number, public scheduler: Scheduler,
        code: Thing, env: Thing<ThingType.env> | Thing<ThingType.nil>) {
        this.enter(code, code.loc, env);
    }

    /**
     * Try to take a single evaluation step in this task. Returns true if the task made progress (e.g. evaluated something or updated its state), or false if the task is currently suspended or has finished execution.
     * If the task throws an error during evaluation, the task may end up in an undefined state.
     */
    step(): boolean {
        try {
            if (this.suspended) return false;

            var top = this.stack.at(-1);
            if (!top) {
                return false;
            }
            var val = top.value,
                state = top.cookie,
                type = val.t,
                typestr = typeNameOf(type),
                children = val.c,
                loc = val.loc;

            if (this.stack.length > this.scheduler.recursionLimit) {
                throw new RuntimeError("too much recursion", loc);
            }

            const hasMacro = () => {
                if (this.result && typecheck(ThingType.macroized)(this.result)) {
                    return true;
                }
                return false;
            };
            const goMacro = () => {
                const val = this.result!.c[0]!;
                this.enter(val, val.loc, top!.env, undefined, "<macro expansion>");
            };
            corrupted: {

                /*
                block:
                    index=0 => try to match all patterns in scope
                    if one matches: call the pattern impl and splice back in, go back to the step 1
                    if no more match: call the block's elements in order, return the last one
                    index >= 1 => evaluate the elements in order
                */
                if (isBlock(val)) {
                    switch (state as BlockEvalState) {
                        // @ts-expect-error
                        case BlockEvalState.initial:
                            top = this.updateArgs(children.slice());
                        // console.log("initial match", this.stack.at(-1)!.argv.map(t => [ThingType[t.t], DEFAULT_UNPARSER.unparse(t)]));
                        // @ts-expect-error
                        case BlockEvalState.matching_patterns:
                            if (walkEnvTree(top.env, (_, patterns) => {
                                // TODO: patterns should be sorted globally by precedence
                                // so user code and native modules can affect it predictably
                                for (var i = 0; i < patterns.length; i++) {
                                    const entry = patterns[i]!,
                                        rightAssociative = entry.v,
                                        pat = entry.c[0]!,
                                        impl = entry.c[1]!,
                                        when = entry.c[2]?.c;
                                    if (when.length > 0 && !typecheck(...when.map(v => v.v))(val)) continue;
                                    const results = matchPattern(top!.argv, pat, rightAssociative);
                                    var result = results[0];
                                    if (rightAssociative && results.length > 0) {
                                        for (var i = 1; i < results.length; i++) {
                                            const nextResult = results[i]!;
                                            if (nextResult.span[0] < result!.span[1]) {
                                                result = nextResult;
                                            } else {
                                                break;
                                            }
                                        }
                                    }
                                    if (result) {
                                        this.updateCookie(0, BlockEvalState.waiting_for_pattern_result, result.span);
                                        this.enter(boxApply(impl, [this.i(loc, flatToVarMap(result, loc), {
                                            // TODO: inject block type variable
                                        })], top!.argv[result.span[0]!]!.loc), loc, top!.env, undefined, "<pattern expansion>");
                                        return true;
                                    } else {
                                        // console.log("no match for", [DEFAULT_UNPARSER.unparse(pat)]);
                                    }
                                }
                                return false;
                            })) {
                                return true;
                            }
                            // console.log("no match for anything - done.");
                            this.result = boxNil(val.loc);
                        case BlockEvalState.evaluating_body_after_no_matches_found:
                            if (hasMacro()) {
                                this.updateCookie(top.index, BlockEvalState.evaluating_body_after_no_matches_found);
                                goMacro();
                                return true;
                            }
                            if (top.index >= top.argv.length) {
                                this.out();
                            } else {
                                this.updateCookie(top.index + 1, BlockEvalState.evaluating_body_after_no_matches_found);
                                this.enter(top.argv[top.index]!, loc, top.env);
                            }
                            return true;
                        case BlockEvalState.waiting_for_pattern_result:
                            if (hasMacro()) { goMacro(); return true; }
                            const res = this.result!;
                            this.result = null;
                            if (res === null) throw new Error("Expected a result");
                            const start = top.data[0] as number;
                            const length = top.data[1] as number - start;
                            const values = typecheck(ThingType.splat)(res) ? res.c : [res];
                            this.updateArgs(top.argv.toSpliced(start, length, ...values));
                            // console.log("parse splice", this.stack.at(-1)!.argv.map(t => [ThingType[t.t], DEFAULT_UNPARSER.unparse(t)]));
                            this.updateCookie(0, BlockEvalState.matching_patterns, null);
                            return true;
                        default:
                            break corrupted;
                    }
                }
                /*
                symbol:
                    look it up, error if not found
                */
                if (typecheck(ThingType.name)(val)) {
                    if (walkEnvTree(top.env, vars => {
                        const result = mapGetKey(vars, val, loc);
                        if (result !== undefined) {
                            this.out(result);
                            return true;
                        }
                        return false;
                    })) return true;
                    throw new RuntimeError(`undefined: ${stringify(val.v)}`, loc);
                }
                if (isSymbol(val)) {
                    throw new RuntimeError(`invalid name: ${stringify(val.v)}`, loc);
                }
                /*
                apply:
                    index=0 eval the function form
                    index>0 evaluate params that need evaluating
                    index>length call
                    deal with result
                */
                if (typecheck(ThingType.apply)(val)) {
                    var res: Thing;
                    switch (state as ApplyEvalState) {
                        case ApplyEvalState.initial:
                            this.updateArgs([]);
                            this.updateCookie(1, ApplyEvalState.waiting_for_functor_result, null);
                            this.enter(children[0]!, loc, top.env);
                            return true;
                        // @ts-expect-error
                        case ApplyEvalState.waiting_for_functor_result:
                            children = (val = (top = this.updateArgs(top.argv.toSpliced(Infinity, 0, this.result!))).value).c;
                            this.result = null;
                        // @ts-expect-error
                        case ApplyEvalState.evaluate_arguments:
                            if (top.index >= children.length) {
                                this.out(); // Result will be the result of the application
                                this.a(val, top.argv[0]!, top.argv.slice(1), top.env, undefined, (val as Thing<ThingType.apply>).v);
                                return true;
                            }
                            const desc = getNthDescriptor(getParamDescriptors(top.argv[0]!, this.scheduler), top.argv.length - 1);  // -1 to account for offset of functor
                            const arg = children[top.index]!;
                            this.updateCookie(top.index, ApplyEvalState.waiting_for_arg_result, null);
                            if (isLazy(desc)) {
                                // TODO: have some way to force-override lazy parameters?
                                this.result = wrapImplicitBlock(arg, top.env);
                            } else {
                                this.enter(arg, loc, top.env);
                                return true;
                            }
                        case ApplyEvalState.waiting_for_arg_result:
                            res = this.result!;
                            this.result = null;
                            if (res === null) throw new Error("Expected a result");
                            if (hasMacro()) {
                                this.updateCookie(top.index, ApplyEvalState.waiting_for_arg_result);
                                goMacro();
                                return true;
                            }
                            this.updateArgs(top.argv.toSpliced(Infinity, 0, ...(typecheck(ThingType.splat)(res) ? res.c : [res])));
                            this.updateCookie(top.index + 1, ApplyEvalState.evaluate_arguments, null);
                            return true;
                        default:
                            break corrupted;
                    }
                }

                /*
                native function in-progress:
                    call into, update state
                */
                if (typecheck(ThingType.nativefunc)(val) && (top.flags & StackFlag.native_func_being_evaluated)) {
                    this.scheduler.callFunction(this, val.v, top);
                    return true;
                }
                /*
                reference:
                    call the getter function
                */
                if (typecheck(ThingType.reference)(val)) {
                    this.out();
                    this.enter(boxApply(val.c[0], [], loc), loc, top.env);
                    return true;
                }
                /*
                everything else:
                    return as-is
                */
                if (isAtom(val)) {
                    this.out(val);
                    return true;
                }
                throw new RuntimeError(`cannot evaluate ${typestr}`, val.loc);
            }
            throw new Error(`corrupted eval state (type=${typestr}, state=${top.cookie})`);
        } catch (e: any) {
            if (!(e instanceof BackolonError)) {
                const e2 = new BackolonError(`Javascript error: ${e?.stack ?? String(e)}`, UNKNOWN_LOCATION);
                e2.cause = e;
                e2.addNote(`Javascript traceback: ${e.stack}`, UNKNOWN_LOCATION);
                e = e2;
            }
            for (var item of this.stack.toReversed()) {
                if (item.name) {
                    e.addNote(`note: called by ${item.name}`, item.loc);
                }
            }
            throw e;
        }
    }
    /**
     * Return a new thing representing the current continuation at this point in evaluation,
     * which when called will return to this point with the given value as the result of the current expression.
     *
     * The continuation will capture the entire stack, so it has infinite extent.
     */
    continuation(loc = UNKNOWN_LOCATION) {
        return new Thing(
            ThingType.continuation,
            [],
            this.stack,
            "<continuation>",
            "",
            "",
            loc,
            false);
    }
    /** inject variables */
    private i(opTrace: LocationTrace, vars: Thing<ThingType.map>, extraVars: Record<string, Thing> = {}, injectReturn = true) {
        forEach(extraVars, (value, key) => mapUpdateKeyMutating(vars, boxNameSymbol(key, opTrace), value, opTrace));
        if (injectReturn) {
            /**
             * Return from a lambda. Only valid inside one (it's not defined outside of one).
             * @backolon
             * @category Control Flow
             * @function return
             * @param {any} valueToReturn
             * @returns {never}
             * @example
             * ```backolon
             * [x] => (
             *     if (x == 0) (return "zero")
             *     # other code here that will be skipped if x == 0
             * )
             * ```
             */
            mapUpdateKeyMutating(vars, boxNameSymbol("return"), this.continuation(opTrace));
        }
        return vars;
    }
    /** apply - for functions the parameters will need to have been evaluated / typechecked*/
    private a(callsite: Thing, functor: Thing, argv: Thing[], env: Thing<ThingType.env> | Thing<ThingType.nil>, name?: string, significant = false) {
        const goDefaults = (pendingDefaults: Thing[], vars: Thing<ThingType.map>) => {
            // Make the new parent env for evaluating the arguments include the caller's scope, to allow dynamic bindings of defaults.
            this.enter(boxApply(functor, pendingDefaults, callsite.loc), callsite.loc, newEnv(vars, boxList([]), callsite.loc, [env]), [functor, ...argv], significant ? name : undefined);
            this.updateCookie(1, ApplyEvalState.evaluate_arguments, null);
        }
        if (typecheck(ThingType.func)(functor)) {
            // do type checks
            // if optional params have defaults, go back to evaluate them in the new scope
            const { e: vars, p: pendingDefaults } = parametersToVars(name ?? functor.v ?? "<lambda>", functor.c[0]!.c as any, argv, callsite);
            if (pendingDefaults.length > 0) {
                // We haven't evaluated the defaults yet...
                return goDefaults(pendingDefaults, vars);
            }
            this.a(callsite, functor.c[1], [this.i(callsite.loc, vars)], env, name ?? functor.v ?? "<lambda>", true);
        }
        else if (typecheck(ThingType.nativefunc)(functor)) {
            const { e: vars, p: pendingDefaults } = parametersToVars(functor.v, this.scheduler.getParamDescriptors(functor.v), argv, callsite);
            if (pendingDefaults.length > 0) {
                return goDefaults(pendingDefaults, vars);
            }
            this.enter(functor, callsite.loc, env, argv, significant ? functor.v : undefined);
            this.updateFlags(StackFlag.native_func_being_evaluated, 0);
        }
        else if (typecheck(ThingType.continuation)(functor)) {
            if (argv.length > 1) throw new RuntimeError("too many arguments to continuation", callsite.loc);
            this.stack = functor.v;
            this.result = argv[0] ?? boxNil(callsite.loc);
        }
        else if (typecheck(ThingType.implicitfunc)(functor)) {
            if (argv.length > 1) {
                throw new RuntimeError("too many arguments to implicit block", callsite.loc);
            }
            const map = argv[0] ?? newEmptyMap(functor.loc);
            if (!typecheck(ThingType.map)(map)) {
                throw new RuntimeError(`expected a map to inject (got ${typeNameOf(map.t)})`, callsite.loc);
            }
            const e = map.c.length === 0 ? functor.v : newEnv(map, boxList([]), callsite.loc, [functor.v]);
            this.enter(functor.c[0], callsite.loc, e, [], significant ? name : undefined);
        }
        else {
            // Try to find a custom applicator for this type
            const applicator = this.scheduler.getApply(functor.t);
            if (applicator) {
                applicator.call(this, functor, argv, callsite, env, name, significant);
                return;
            }
            throw new RuntimeError(`can't call ${typeNameOf(functor.t)}`, callsite.loc);
        }
    }
    /**
     * Update the current stack frame with new arguments, returning the new stack frame.
     */
    updateArgs(args: Thing[]) {
        const val = this.stack.at(-1)!.g(args);
        this.stack = this.stack.with(-1, val);
        return val;
    }
    /**
     * Update the current stack frame with a new cookie value(s), returning the new stack frame.
     * The cookie is used to track internal evaluation state for constructs that call back into Backolon code,
     * so the Javascript implementation knows where it was and can resume evaluation from the correct point when the Backolon code returns.
     *
     * The exact meaning of the cookie value(s) depends on the construct being evaluated.
     * 
     * @param data An optional additional data to store in the stack frame. If not provided, the data value from the current stack frame is used.
     */
    updateCookie(index: number, state: number, data?: any) {
        const top = this.stack.at(-1)!;
        const updated = top.sd(index, state, data ?? top.data);
        this.stack = this.stack.with(-1, updated);
        return updated;
    }
    /**
     * Updates the current stack frame with new flags, returning the new stack frame.
     * @see {@link StackFlag}
     * @param toClear Bitmask of flags to clear
     * @param toSet Bitmask of flags to set (takes precedence over `toClear`)
     */
    updateFlags(toSet: number, toClear: number) {
        const top = this.stack.at(-1)!;
        const updated = top.f(toSet, toClear);
        this.stack = this.stack.with(-1, updated);
        return updated;
    }
    /**
     * Updates the current stack frame with a new environment, returning the new stack frame. This is used when entering a new scope (e.g. injecting context-sensitive information).
     */
    updateEnv(newEnv: Thing<ThingType.env>) {
        const top = this.stack.at(-1)!;
        const updated = top.e(newEnv);
        this.stack = this.stack.with(-1, updated);
        return updated;
    }
    /**
     * Enters a new stack frame with the given code, location, environment, and arguments.
     * @param loc The location trace to use in error messages.
     * @param name The name of the stack frame, if it is significant and should appear in a stack trace.
     */
    enter(code: Thing, loc: LocationTrace, env: Thing<ThingType.env> | Thing<ThingType.nil>, args: readonly Thing[] = [], name?: string | null) {
        this.stack = this.stack.toSpliced(Infinity, 0, new StackFrame(code, loc, args, env, name ?? null));
    }
    setCall(func: Thing, argv: Thing[], loc: LocationTrace, env: Thing<ThingType.env> | Thing<ThingType.nil>) {
        // TODO: munge state so that it will call immediately when returning
        this.enter(boxApply(func, [...argv, boxNil(loc)], loc), loc, env, argv);
        this.updateCookie(argv.length, ApplyEvalState.waiting_for_arg_result);
        throw 1;
    }
    /**
     * Exit the current stack frame, optionally with a result to return to the caller.
     * The result will be passed back to whatever got us here (e.g. the parent stack frame or the creator of the task).
     * If the `failed` parameter is provided, it sets {@link Task#failed|this.failed} to it.
     * Returns the new top stack frame.
     */
    out(result?: Thing, failed?: boolean): StackFrame {
        this.result = result ?? this.result;
        if (failed !== undefined) this.failed = failed;
        return (this.stack = this.stack.toSpliced(-1, 1)).at(-1)!;
    }
    /**
     * Temporarily pop the given number of stack frames, call the callback with the new top of the stack, and then restore the popped stack frames.
     * This is used for things like variable declaration and assignment where we need to access the correct environment to put the variable in.
     *
     * If depth is greater than or equal to the current stack size, the callback will be called with the bottom of the stack (which is usually the global scope).
     */
    dip(depth: number, cb: (state: StackFrame) => void) {
        if (this.stack.length > depth) {
            const end = this.stack.slice(-depth);
            cb((this.stack = this.stack.slice(0, -depth)).at(-1)!);
            this.stack = [...this.stack, ...end];
        } else {
            cb(this.stack[0]!);
        }
    }
}
