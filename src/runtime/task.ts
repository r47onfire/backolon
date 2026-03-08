import { stringify } from "lib0/json";
import { forEach } from "lib0/object";
import { LocationTrace, RuntimeError, UNKNOWN_LOCATION } from "../errors";
import { mapGetKey, mapUpdateKeyMutating } from "../objects/map";
import { boxList, boxNameSymbol, isAtom, isBlock, isSymbol, Thing, ThingType, typecheck } from "../objects/thing";
import { matchPattern } from "../patterns/match";
import { flatToVarMap, newEnv } from "./env";
import { checkargs, isLazyParamIndex, parametersToVars, wrapImplicitBlock } from "./functor";
import { type Scheduler } from "./scheduler";

export class StackEntry {
    constructor(
        /** current value being evaluated */
        public readonly v: Thing,
        /** arguments in-progress being evaluated */
        public readonly a: readonly Thing[],
        /** current environment */
        public readonly e: Thing<ThingType.env | ThingType.nil>,
        /** current index in evaluating args */
        public readonly i = 0,
        /** internal state for evaluation */
        public readonly s: number = 0,
        /** arbitrary data */
        public readonly d: any = null,
    ) { }
    sd(index: number, state: number, data: any) {
        return new StackEntry(this.v, this.a, this.e, index, state, data);
    }
    g(args: Thing[]) {
        return new StackEntry(this.v, args, this.e, this.i, this.s, this.d);
    }
}

export class Task {
    suspended = false;
    stack: readonly StackEntry[] = [];
    private r: Thing | null = null;
    constructor(public priority: number, public scheduler: Scheduler,
        code: Thing, env: Thing<ThingType.env | ThingType.nil>) {
        this.e(code, env);
    }

    step(): boolean {
        if (this.suspended) return false;

        var top = this.stack.at(-1);
        if (!top) {
            return false;
        }
        const val = top.v,
            state = top.s,
            type = val.t,
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
                enum BlockEvalState {
                    initial = 0,
                    matching_patterns,
                    evaluating_body_after_no_matches_found,
                    waiting_for_pattern_result,
                }
                switch (state as BlockEvalState) {
                    // @ts-expect-error
                    case BlockEvalState.initial:
                        top = this.ua(children.slice());
                    // @ts-expect-error
                    case BlockEvalState.matching_patterns:
                        for (var env = top.e; !typecheck(ThingType.nil)(env); env = env.c[0]!) {
                            const patterns = env.c[2]?.c ?? [];
                            for (var i = 0; i < patterns.length; i++) {
                                const pair = patterns[i]!,
                                    pat = pair.c[0]! as Thing<ThingType.pattern>,
                                    impl = pair.c[1]!,
                                    when = pair.c[2]?.c;
                                if (when && !typecheck(...when.map(v => v.v))(val)) continue;
                                const result = matchPattern(top.a, pat, false)[0];
                                if (result) {
                                    this.usd(0, BlockEvalState.waiting_for_pattern_result, result.span);
                                    this.a(top.a[result.span[0]!]!, [impl, this.i(loc, flatToVarMap(result, loc), {
                                        // TODO: inject block type variable
                                    })]);
                                    return true;
                                }
                            }
                        }
                    case BlockEvalState.evaluating_body_after_no_matches_found:
                        if (top.i >= top.a.length) {
                            this.x();
                        } else {
                            this.usd(top.i + 1, BlockEvalState.evaluating_body_after_no_matches_found);
                            this.e(top.a[top.i]!, top.e);
                        }
                        return true;
                    case BlockEvalState.waiting_for_pattern_result:
                        const res = this.r!;
                        this.r = null;
                        if (res === null) throw new Error("Expected a result");
                        const start = top.d[0] as number;
                        const length = top.d[1] as number - start;
                        const values = typecheck(ThingType.splat)(res) ? res.c : [res];
                        this.ua(top.a.toSpliced(start, length, ...values));
                        this.usd(0, BlockEvalState.matching_patterns, null);
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
                for (var env = top.e; !typecheck(ThingType.nil)(env); env = env.c[0]!) {
                    const vars = env.c[1]!;
                    const result = mapGetKey(vars, top.v, loc);
                    if (result !== undefined) {
                        this.x(result);
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
                enum ApplyEvalState {
                    initial = 0,
                    waiting_for_functor_result,
                    evaluate_arguments,
                    waiting_for_arg_result,
                }
                var res: Thing;
                switch (state as ApplyEvalState) {
                    case ApplyEvalState.initial:
                        this.ua([]);
                        this.usd(1, ApplyEvalState.waiting_for_functor_result, null);
                        this.e(children[0]!, top.e);
                        return true;
                    // @ts-expect-error
                    case ApplyEvalState.waiting_for_functor_result:
                        res = this.r!;
                        this.r = null;
                        this.ua(top.a.toSpliced(Infinity, 0, res));
                    // @ts-expect-error
                    case ApplyEvalState.evaluate_arguments:
                        if (top.i >= children.length) {
                            this.a(val, top.a);
                            return true;
                        }
                        const arg = children[top.i]!;
                        this.usd(top.i, ApplyEvalState.waiting_for_arg_result, null);
                        if (isLazyParamIndex(this.scheduler, val.c[0]! as any, top.i - 1)) { // -1 to account for offset of functor
                            this.r = wrapImplicitBlock(arg, top.e);
                        } else {
                            this.e(arg, top.e);
                            return true;
                        }
                    case ApplyEvalState.waiting_for_arg_result:
                        res = this.r!;
                        this.r = null;
                        if (res === null) throw new Error("Expected a result");
                        if (typecheck(ThingType.macroized)(res)) {
                            this.e(res, top.e);
                            return true;
                        }
                        const values = typecheck(ThingType.splat)(res) ? res.c : [res];
                        this.ua(top.a.toSpliced(Infinity, 0, ...values));
                        this.usd(top.i + 1, ApplyEvalState.evaluate_arguments, null);
                        return true;
                    default:
                        break corrupted;
                }
            }
            /*
            everything else:
                return as-is
            */
            if (isAtom(val)) {
                this.x(val);
                return true;
            }
            throw new RuntimeError("cannot evaluate", val.loc);
        }
        throw new Error(`corrupted eval state (type=${ThingType[type as number] ?? type}, state=${top.s})`);
    }
    continuation(loc = UNKNOWN_LOCATION) {
        return new Thing(
            ThingType.continuation,
            [],
            this.stack,
            "",
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
    /** apply */
    private a(callsite: Thing, args: readonly Thing[]) {
        const functor = args[0]!;
        const rest = args.slice(1);
        if (typecheck(ThingType.func)(functor)) {
            this.a(callsite, [functor.c[1], this.i(callsite.loc, parametersToVars(functor.c[0], rest, callsite))]);
        }
        else if (typecheck(ThingType.nativefunc)(functor)) {
            this.scheduler.callFunction(this, functor.v, rest);
        }
        else if (typecheck(ThingType.boundmethod)(functor)) {
            const realFunctor = functor.c[1];
            this.a(callsite, [realFunctor.c[1], parametersToVars(realFunctor.c[0], [functor.c[0], ...rest], callsite)]);
        }
        else if (typecheck(ThingType.continuation)(functor)) {
            checkargs(1, 1, rest, callsite);
            this.stack = functor.v;
            this.r = rest[0]!;
        }
        else if (typecheck(ThingType.implicitfunc)(functor)) {
            checkargs(1, 1, rest, callsite);
            const map = rest[0]!;
            if (!typecheck(ThingType.map)(map)) {
                throw new RuntimeError("Expected a map to inject", callsite.loc);
            }
            this.e(functor.c[0], newEnv(map, boxList([]), callsite.loc, functor.v));
        }
        else throw new RuntimeError("can't call this value", callsite.loc);
    }
    private ua(args: Thing[]) {
        const val = this.stack.at(-1)!.g(args);
        this.stack = this.stack.with(-1, val);
        return val;
    }
    private usd(index: number, state: number, data?: any) {
        const top = this.stack.at(-1)!;
        const updated = top.sd(index, state, data ?? top.d);
        this.stack = this.stack.with(-1, updated);
        return updated;
    }
    /** enter/call, with no injected block */
    private e(code: Thing, env: Thing<ThingType.env | ThingType.nil>) {
        this.stack = this.stack.toSpliced(Infinity, 0, new StackEntry(code, [], env));
    }
    private x(result?: Thing) {
        this.r = result ?? this.r;
        this.stack = this.stack.toSpliced(-1, 1);
    }
}
