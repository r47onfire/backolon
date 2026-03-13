import { stringify } from "lib0/json";
import { forEach } from "lib0/object";
import { LocationTrace, RuntimeError, UNKNOWN_LOCATION } from "../errors";
import { mapGetKey, mapUpdateKeyMutating, newEmptyMap } from "../objects/map";
import { boxApply, boxList, boxNameSymbol, boxNil, isAtom, isBlock, isSymbol, Thing, ThingType, typecheck } from "../objects/thing";
import { matchPattern } from "../patterns/match";
import { flatToVarMap, newEnv } from "./env";
import { getNthDescriptor, getParamDescriptors, isLazy, parametersToVars, wrapImplicitBlock } from "./functor";
import { type Scheduler } from "./scheduler";

export enum StackFlag {
    native_func_being_evaluated = 1,
}

export class StackEntry {
    constructor(
        /** current value being evaluated */
        public readonly value: Thing,
        /** arguments in-progress being evaluated */
        public readonly argv: readonly Thing[],
        /** current environment */
        public readonly env: Thing<ThingType.env | ThingType.nil>,
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
        return new StackEntry(this.value, this.argv, this.env, this.name, index, state, data, this.flags);
    }
    g(args: Thing[]) {
        return new StackEntry(this.value, args, this.env, this.name, this.index, this.cookie, this.data, this.flags);
    }
    f(toSet: number, toClear: number) {
        return new StackEntry(this.value, this.argv, this.env, this.name, this.index, this.cookie, this.data, (this.flags & (~toClear)) | toSet);
    }
    e(newEnv: Thing<ThingType.env>) {
        return new StackEntry(this.value, this.argv, newEnv, this.name, this.index, this.cookie, this.data, this.flags);
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

export class Task {
    suspended = false;
    stack: readonly StackEntry[] = [];
    result: Thing | null = null;
    constructor(public priority: number, public scheduler: Scheduler,
        code: Thing, env: Thing<ThingType.env | ThingType.nil>) {
        this.enter(code, env);
    }

    step(): boolean {
        if (this.suspended) return false;

        var top = this.stack.at(-1);
        if (!top) {
            return false;
        }
        var val = top.value,
            state = top.cookie,
            type = val.t,
            typestr = ThingType[type as number] ?? type,
            children = val.c,
            loc = val.loc;
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
                    // @ts-expect-error
                    case BlockEvalState.matching_patterns:
                        for (var env = top.env; !typecheck(ThingType.nil)(env); env = env.c[0]!) {
                            const patterns = env.c[2]?.c ?? [];
                            for (var i = 0; i < patterns.length; i++) {
                                const pair = patterns[i]!,
                                    pat = pair.c[0]! as Thing<ThingType.pattern>,
                                    impl = pair.c[1]!,
                                    when = pair.c[2]?.c;
                                if (when && !typecheck(...when.map(v => v.v))(val)) continue;
                                const result = matchPattern(top.argv, pat, false)[0];
                                if (result) {
                                    this.updateCookie(0, BlockEvalState.waiting_for_pattern_result, result.span);
                                    this.enter(boxApply(impl, [this.i(loc, flatToVarMap(result, loc), {
                                        // TODO: inject block type variable
                                    })], top.argv[result.span[0]!]!.loc), top.env);
                                    return true;
                                }
                            }
                        }
                        this.result = boxNil(val.loc);
                    case BlockEvalState.evaluating_body_after_no_matches_found:
                        if (top.index >= top.argv.length) {
                            this.out();
                        } else {
                            this.updateCookie(top.index + 1, BlockEvalState.evaluating_body_after_no_matches_found);
                            this.enter(top.argv[top.index]!, top.env);
                        }
                        return true;
                    case BlockEvalState.waiting_for_pattern_result:
                        const res = this.result!;
                        this.result = null;
                        if (res === null) throw new Error("Expected a result");
                        const start = top.data[0] as number;
                        const length = top.data[1] as number - start;
                        const values = typecheck(ThingType.splat)(res) ? res.c : [res];
                        this.updateArgs(top.argv.toSpliced(start, length, ...values));
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
                for (var env = top.env; !typecheck(ThingType.nil)(env); env = env.c[0]!) {
                    const vars = env.c[1]!;
                    const result = mapGetKey(vars, val, loc);
                    if (result !== undefined) {
                        this.out(result);
                        return true;
                    }
                }
                throw new RuntimeError(`undefined: ${stringify(val.v)}`, loc);
            }
            if (isSymbol(val)) {
                throw new RuntimeError(`invalid name: ${stringify(val.v)}`);
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
                        this.enter(children[0]!, top.env);
                        return true;
                    // @ts-expect-error
                    case ApplyEvalState.waiting_for_functor_result:
                        children = (val = (top = this.updateArgs(top.argv.toSpliced(Infinity, 0, this.result!))).value).c;
                        this.result = null;
                    // @ts-expect-error
                    case ApplyEvalState.evaluate_arguments:
                        if (top.index >= children.length) {
                            this.out(); // Result will be the result of the application
                            this.a(val, top.argv[0]!, top.argv.slice(1), top.env);
                            return true;
                        }
                        const desc = getNthDescriptor(getParamDescriptors(top.argv[0]!, this.scheduler, val), top.argv.length - 1);  // -1 to account for offset of functor
                        const arg = children[top.index]!;
                        this.updateCookie(top.index, ApplyEvalState.waiting_for_arg_result, null);
                        if (isLazy(desc)) {
                            this.result = wrapImplicitBlock(arg, top.env);
                        } else {
                            this.enter(arg, top.env);
                            return true;
                        }
                    case ApplyEvalState.waiting_for_arg_result:
                        res = this.result!;
                        this.result = null;
                        if (res === null) throw new Error("Expected a result");
                        if (typecheck(ThingType.macroized)(res)) {
                            this.enter(res, top.env);
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
    }
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
        if (injectReturn) mapUpdateKeyMutating(vars, boxNameSymbol("return"), this.continuation(opTrace));
        return vars;
    }
    /** apply - for functions the parameters will need to have been evaluated / typechecked*/
    private a(callsite: Thing, functor: Thing, argv: readonly Thing[], env: Thing<ThingType.env | ThingType.nil>) {
        const goDefaults = (pendingDefaults: Thing[], vars: Thing<ThingType.map>) => {
            // Make the new parent env for evaluating the arguments include the caller's scope, to allow dynamic bindings of defaults.
            this.enter(boxApply(functor, pendingDefaults, callsite.loc), newEnv(vars, boxList([]), callsite.loc, env), [functor, ...argv]);
            this.updateCookie(1, ApplyEvalState.evaluate_arguments, null);
        }
        if (typecheck(ThingType.func)(functor)) {
            // do type checks
            // if optional params have defaults, go back to evaluate them in the new scope
            const { e: vars, p: pendingDefaults } = parametersToVars(functor.c[0]!.c as any, argv, callsite);
            if (pendingDefaults.length > 0) {
                // We haven't evaluated the defaults yet...
                return goDefaults(pendingDefaults, vars);
            }
            this.a(callsite, functor.c[1], [this.i(callsite.loc, vars)], env);
        }
        else if (typecheck(ThingType.nativefunc)(functor)) {
            const { e: vars, p: pendingDefaults } = parametersToVars(this.scheduler.getParamDescriptors(functor.v), argv, callsite);
            if (pendingDefaults.length > 0) {
                return goDefaults(pendingDefaults, vars);
            }
            this.enter(functor, env, argv);
            this.updateFlags(StackFlag.native_func_being_evaluated, 0);
        }
        else if (typecheck(ThingType.boundmethod)(functor)) {
            const realFunctor = functor.c[1];
            this.a(callsite, realFunctor.c[1], [functor.c[0], ...argv], env);
        }
        else if (typecheck(ThingType.continuation)(functor)) {
            if (argv.length !== 1) throw new RuntimeError("expected an argument to continuation", callsite.loc);
            this.stack = functor.v;
            this.result = argv[0]!;
        }
        else if (typecheck(ThingType.implicitfunc)(functor)) {
            if (argv.length > 1) {
                throw new RuntimeError("too many arguments to implicit block", callsite.loc);
            }
            const map = argv[0] ?? newEmptyMap(functor.loc);
            if (!typecheck(ThingType.map)(map)) {
                throw new RuntimeError(`expected a map to inject (got ${ThingType[map.t as any] ?? map.t})`, callsite.loc);
            }
            this.enter(functor.c[0], newEnv(map, boxList([]), callsite.loc, functor.v[0]), [], functor.v[1]);
        }
        else throw new RuntimeError(`can't call ${ThingType[functor.t as any] ?? functor.t}`, callsite.loc);
    }
    updateArgs(args: Thing[]) {
        const val = this.stack.at(-1)!.g(args);
        this.stack = this.stack.with(-1, val);
        return val;
    }
    updateCookie(index: number, state: number, data?: any) {
        const top = this.stack.at(-1)!;
        const updated = top.sd(index, state, data ?? top.data);
        this.stack = this.stack.with(-1, updated);
        return updated;
    }
    updateFlags(toSet: number, toClear: number) {
        const top = this.stack.at(-1)!;
        const updated = top.f(toSet, toClear);
        this.stack = this.stack.with(-1, updated);
        return updated;
    }
    updateEnv(newEnv: Thing<ThingType.env>) {
        const top = this.stack.at(-1)!;
        const updated = top.e(newEnv);
        this.stack = this.stack.with(-1, updated);
        return updated;
    }
    /** enter/call, with no injected block */
    enter(code: Thing, env: Thing<ThingType.env | ThingType.nil>, args: readonly Thing[] = [], name?: string | null) {
        this.stack = this.stack.toSpliced(Infinity, 0, new StackEntry(code, args, env, name ?? null));
    }
    out(result?: Thing): StackEntry {
        this.result = result ?? this.result;
        return (this.stack = this.stack.toSpliced(-1, 1)).at(-1)!;
    }
    dip(depth: number, cb: (state: StackEntry) => void) {
        if (this.stack.length > depth) {
            const end = this.stack.slice(-depth);
            cb((this.stack = this.stack.slice(0, -depth)).at(-1)!);
            this.stack = [...this.stack, ...end];
        } else {
            cb(this.stack.at(-1)!);
        }
    }
}
