import { LocationTrace } from "../errors";
import { newEmptyMap, mapUpdateKeyMutating, mapGetKey } from "../objects/map";
import { boxNameSymbol, ThingType, Thing, boxList, boxNativeFunc, boxNumber, boxApply } from "../objects/thing";
import { parse } from "../parser/parse";
import { parsePattern } from "../patterns/meta";
import { newEnv } from "../runtime/env";
import { ParamDescriptor, parseSignature } from "../runtime/functor";
import { NativeFunctionDetails } from "../runtime/scheduler";


export const symbol_x = boxNameSymbol("x"), symbol_y = boxNameSymbol("y"), symbol_z = boxNameSymbol("z");

export interface OperatorOverload {
    types: (ThingType | string | null)[];
    cb(opTrace: LocationTrace, argv: readonly any[]): Thing;
}

/**
 * Defines what happens when an object of a particular non-builtin type is called as the functor in an apply expression.
 * See {@link NativeModule#defcall|NativeModule.defcall} for details.
 */
export interface CustomApplicator {
    /**
     * Implements what happens when a functor of the given type is called.
     *
     * The applicator will be called with the functor, arguments, and callsite information, and should perform the application
     * (e.g. by evaluating the functor with the given arguments in some environment) and eventually produce a result by calling `task.out(result)`.
     * @param task The current task, which can be used to evaluate code and return results.
     * @param functor The thing that was called.
     * @param argv The arguments to the call.
     * @param callsite The location of the apply form in the source code, used for error reporting.
     * @param env The current environment that the call is being made in, which can be used to look up variables and patterns.
     * @param name The resolved name of the functor being called (for debugging purposes), or undefined if the functor isn't named.
     * @param significant True if the runtime has determined that this call will show a stack frame in a traceback should an error occur.
     */
    call(
        task: any,
        functor: Thing,
        argv: Thing[],
        callsite: Thing,
        env: Thing<ThingType.env> | Thing<ThingType.nil>,
        name?: string,
        significant?: boolean
    ): void;
    /**
     * Return the parameter descriptors for the given functor, which will be used for type checking and lazy evaluation of arguments when this applicator is called.
     * The functor will always be a Thing of the type that this applicator was registered for.
     */
    params(functor: Thing): ParamDescriptor[];
}

/**
 * Native module container for Backolon builtins, syntax, and operators.
 */
export class NativeModule {
    env: Thing<ThingType.env>;
    funcs: Record<string, NativeFunctionDetails> = {};
    ops: Record<string, Partial<Record<number, OperatorOverload[]>>> = {};
    applicators: Partial<Record<string, CustomApplicator>> = {};
    constructor(public name: string, public loc: LocationTrace) {
        this.env = newEnv(newEmptyMap(loc), boxList([], loc), loc);
    }
    /**
     * Defines a variable in the module's environment.
     */
    defvar(name: string, value: Thing) {
        mapUpdateKeyMutating(this.env.c[1], boxNameSymbol(name, this.loc), value);
    }
    /**
     * Defines a native function in the module.
     *
     * If the function needs to call into Backolon code, it can do so by updating the current cookie on the task to remember where it is in execution and then calling `task.enter(code, loc, env)` with the appropriate code, location, and environment.
     *
     * The function should "return" its result by calling `task.out(result)`. If the Javascript function does not call `task.out()` and just returns, the scheduler will call the implementation again until it does, so it's important to call `task.out()` at some point to avoid infinite loops.
     * @param signature The string describing the function signature, the same way as in lambda headers in Backolon code. For example, "_:map" for a function taking a single map argument, or "x y" for a function taking two arguments of any type.
     * @param defvar Whether to also define a variable with the function's name pointing to the function itself (thus making the function accessible from Backolon code).
     */
    defun(name: string, signature: string, body: NativeFunctionDetails["impl"], defvar = true) {
        this.funcs[name] = {
            params: parseSignature(parse(signature, this.loc.file).c),
            impl: body,
        };
        if (defvar) {
            this.defvar(name, boxNativeFunc(name, this.loc));
        }
    }
    /**
     * Defines a new pattern syntax. The handler can be either a native function implementation, or a Backolon function defined in the same module (in either case
     * the handler will be called with the pattern variables as a single map argument).
     * @param pattern The pattern string, in the same format as in Backolon patterns. For example, "x:roundblock" for a pattern matching a single round block and binding it to x, or "x:number y:string" for a pattern matching a number followed by a string and binding them to x and y respectively.
     * @param right Whether the pattern is right-associative (only matters for patterns that can be chained, like infix operators).
     * @param when Which block types may contain this pattern. null is equivalent to [{@link ThingType.roundblock}, {@link ThingType.topblock}].
     * @param handler The name of the native function implementing the pattern rewriter.
     * @param handlerBody If present, the native function implementation of the pattern rewriter. If not present, the handler is expected to be defined elsewhere (e.g. by a call to {@link defun} in the same module) and this function will just reference it by name.
     */
    defsyntax(pattern: string, precedence: number, right: boolean, when: ThingType[] | null, handler: string, handlerBody?: NativeFunctionDetails["impl"]) {
        if (handlerBody) {
            this.defun(handler, "_:map", handlerBody);
        }
        const pat = parsePattern(parse(pattern, this.loc.file).c);
        const patterns: Thing<ThingType.pattern_entry>[] = this.env.c[2].c as any;
        patterns.push(new Thing(ThingType.pattern_entry, [
            pat,
            boxNativeFunc(handler, this.loc),
            boxList((when ?? [ThingType.roundblock, ThingType.topblock]).map(m => boxNumber(m, this.loc)), this.loc),
            boxNumber(precedence, this.loc),
        ], right, "", "", "", this.loc));
        sortPatternsList(patterns);
    }
    /**
     * Defines a new operator overload native function, mapping to the given operator name.
     * @param builtin The name to give the builtin function implementing the operator overload (e.g. "__add" for overloading the "add" operator).
     * @param name The operator name to overload (e.g. "add").
     */
    defop(builtin: string, name: string) {
        this.defun(builtin, "values...", (task, state) => {
            task.out(task.scheduler.operator(name, state));
        });
    }
    /**
     * Defines a new operator overload for the given operator name and argument types. The handler will be called with the operator arguments as an array, and should return the result of the operator application.
     * @param types List of argument types for this overload, where each type can be a ThingType, a string representing a type class, or null for any type. The length of this list determines the arity of the operator overload.
     */
    defoverload<const T extends (ThingType | string | null)[]>(name: string, types: T, cb: (opTrace: LocationTrace, argv: MapValues<T>) => Thing) {
        ((this.ops[name] ??= {})[types.length] ??= []).push({ types, cb });
    }
    /**
     * Defines a custom applicator for a given type of functor. The applicator will be called with the functor, arguments, and callsite information whenever an apply form with a functor of the given type is evaluated in Backolon code.
     */
    defcall(type: string, applicator: CustomApplicator) {
        this.applicators[type] = applicator;
    }
}

/**
 * Helper to rewrite pattern handlers into apply forms for native builtins.
 */
export function rewriteAsApply(symbols: Thing<ThingType.name>[], builtinName: string, start?: string, end?: string): NativeFunctionDetails["impl"] {
    return (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        var values = symbols.map(sym => mapGetKey(groups, sym));
        // trim off undefined's
        if (values.includes(undefined)) values = values.slice(0, values.indexOf(undefined));
        task.out(boxApply(boxNativeFunc(builtinName, state.value.loc), values as Thing[], state.value.loc, start, end));
    };
}

export function sortPatternsList(list: Thing<ThingType.pattern_entry>[]) {
    list.sort((a, b) => Number(a.c[3].v) - Number(b.c[3].v));
}
type MapValues<T extends readonly (ThingType | string | null)[]> = {
    [K in keyof T]: T[K] extends null ? Thing : Thing<Exclude<T[K], null>>;
};
