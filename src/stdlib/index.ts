import { RuntimeError } from "../errors";
import { mapUpdateKeyMutating, newEmptyMap } from "../objects/map";
import { boxList, boxNameSymbol, boxNativeFunc, boxNumber, Thing, ThingType, typecheck } from "../objects/thing";
import { parse } from "../parser/parse";
import { parsePattern } from "../patterns/meta";
import { newEnv } from "../runtime/env";
import { BUILTINS_LOC, parseSignature } from "../runtime/functor";
import { NativeFunctionDetails } from "../runtime/scheduler";
import { initCoreSyntax } from "./core";

export function define_builtin_variable(
    inEnv: Thing<ThingType.env>,
    name: string,
    value: Thing
) {
    mapUpdateKeyMutating(inEnv.c[1], boxNameSymbol(name), value);
}

export function define_builtin_function(
    inEnv: Thing<ThingType.env> | null,
    inFuncs: Record<string, NativeFunctionDetails>,
    name: string,
    signature: string,
    body: NativeFunctionDetails["impl"],
    loc = BUILTINS_LOC,
) {
    inFuncs[name] = {
        params: parseSignature(parse(signature, loc.file).c),
        impl: body,
    };
    if (inEnv) {
        define_builtin_variable(inEnv, name, boxNativeFunc(name, loc));
    }
}

export function define_pattern(
    inEnv: Thing<ThingType.env>,
    inFuncs: Record<string, NativeFunctionDetails>,
    pattern: string,
    when: ThingType[],
    handlerName: string,
    handlerBody?: NativeFunctionDetails["impl"],
    loc = BUILTINS_LOC
) {
    if (handlerBody) {
        define_builtin_function(inEnv, inFuncs, handlerName, "_:map", handlerBody, loc);
    }
    const pat = parsePattern(parse(pattern, loc.file).c);
    inEnv.c[2].c.push(new Thing(ThingType.triple, [
        pat,
        boxNativeFunc(handlerName, loc),
        boxList(when.map(m => boxNumber(m, loc)), loc),
    ], null, "", "", "", loc))
}

function createBuiltins(): { b: Thing<ThingType.env>, f: Record<string, NativeFunctionDetails> } {
    const builtinsEnv = newEnv(newEmptyMap(BUILTINS_LOC), boxList([], BUILTINS_LOC), BUILTINS_LOC);
    const builtinFunctions: Record<string, NativeFunctionDetails> = {};
    initCoreSyntax(builtinsEnv, builtinFunctions);
    return { b: builtinsEnv, f: builtinFunctions };
}


export const { b: BUILTIN_ENV, f: BUILTIN_FUNCTIONS } = createBuiltins();

export function implicitToVariableName(i: Thing<ThingType.implicitfunc>): Thing<ThingType.name> {
    const children = i.c;
    if (children.length !== 1) {
        throw new RuntimeError("invalid variable name", i.loc);
    }
    const name = children[0]!;
    if (!typecheck(ThingType.name)(name)) {
        throw new RuntimeError("not a variable name", name.loc);
    }
    return name;
}
