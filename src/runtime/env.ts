import { isArray } from "lib0/array";
import { LocationTrace } from "../errors";
import { mapUpdateKeyMutating, newEmptyMap } from "../objects/map";
import { boxList, boxNil, Thing, ThingType, typecheck } from "../objects/thing";
import { MatchResult } from "../patterns/match";

export function newEnv(newVars: Thing<ThingType.map>, newPatterns: Thing<ThingType.list>, callsite: LocationTrace, parents: Thing<ThingType.nil | ThingType.env>[] = [boxNil(callsite)]): Thing<ThingType.env> {
    return new Thing(ThingType.env, [boxList(parents, callsite), newVars, newPatterns], null, "", "", "", callsite);
}

export function flatToVarMap(result: MatchResult, location: LocationTrace): Thing<ThingType.map> {
    const map = newEmptyMap(location);
    for (var [name, value] of result.bindings) {
        if (isArray(value)) value = boxList(value, value[0]?.loc);
        mapUpdateKeyMutating(map, name, value)
    }
    return map;
}

export function walkEnvTree(env: Thing<ThingType.env> | Thing<ThingType.nil>, callback: (vars: Thing<ThingType.map>, patterns: Thing<ThingType.pattern_entry>[]) => boolean): boolean {
    if (typecheck(ThingType.nil)(env)) return false;
    if (callback(env.c[1], env.c[2].c as any)) return true;
    for (var parent of env.c[0].c) if (walkEnvTree(parent as any, callback)) return true;
    return false;
}
