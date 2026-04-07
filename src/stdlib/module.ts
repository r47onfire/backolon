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

export interface CustomApplicator {
    call(
        task: any,
        functor: Thing,
        argv: Thing[],
        callsite: Thing,
        env: Thing<ThingType.env> | Thing<ThingType.nil>,
        name?: string,
        significant?: boolean
    ): void;
    params(functor: Thing): ParamDescriptor[];
}

export class NativeModule {
    env: Thing<ThingType.env>;
    funcs: Record<string, NativeFunctionDetails> = {};
    ops: Record<string, Partial<Record<number, OperatorOverload[]>>> = {};
    applicators: Partial<Record<string, CustomApplicator>> = {};
    constructor(public name: string, public loc: LocationTrace) {
        this.env = newEnv(newEmptyMap(loc), boxList([], loc), loc);
    }
    defvar(name: string, value: Thing) {
        mapUpdateKeyMutating(this.env.c[1], boxNameSymbol(name, this.loc), value);
    }
    defun(name: string, signature: string, body: NativeFunctionDetails["impl"]) {
        this.funcs[name] = {
            params: parseSignature(parse(signature, this.loc.file).c),
            impl: body,
        };
        this.defvar(name, boxNativeFunc(name, this.loc));
    }
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
    defop(builtin: string, name: string) {
        this.defun(builtin, "values...", (task, state) => {
            task.out(task.scheduler.operator(name, state));
        });
    }
    defoverload<const T extends (ThingType | string | null)[]>(name: string, types: T, cb: (opTrace: LocationTrace, argv: MapValues<T>) => Thing) {
        ((this.ops[name] ??= {})[types.length] ??= []).push({ types, cb });
    }
    defcall(type: string, applicator: CustomApplicator) {
        this.applicators[type] = applicator;
    }
}

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
