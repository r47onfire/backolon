import { last } from "lib0/array";
import { stringify } from "lib0/json";
import { RuntimeError } from "../errors";
import { mapGetKey, mapUpdateKeyMutating, newEmptyMap } from "../objects/map";
import { boxList, boxNameSymbol, boxNil, boxNumber, isSymbol, Thing, ThingType, typecheck, typeNameOf } from "../objects/thing";
import { nonoverlappingreplace, p, removed_whitespace, typeNameToThingType } from "../patterns/meta";
import { BUILTINS_LOC } from "../stdlib/locations";
import { type Scheduler } from "./scheduler";

export type ParamDescriptor = Thing<ThingType.paramdescriptor> | Thing<ThingType.name>;

const CONTINUATION_SIGNATURE = [boxNameSymbol("value", BUILTINS_LOC)];
const IMPLICIT_SIGNATURE = [new Thing(ThingType.paramdescriptor, [boxNameSymbol("env", BUILTINS_LOC), boxList([boxNumber(ThingType.map, BUILTINS_LOC)], BUILTINS_LOC)], [false, false, false], "", "", ":", BUILTINS_LOC)];
const NOT_A_PARAM = new Thing(ThingType.paramdescriptor, [boxNameSymbol("invalid", BUILTINS_LOC)], [true, false, false], "", "", "", BUILTINS_LOC);
export function getParamDescriptors(fn: Thing, scheduler: Scheduler): ParamDescriptor[] {
    if (typecheck(ThingType.func)(fn)) {
        return fn.c[0].c as any;
    }
    else if (typecheck(ThingType.nativefunc)(fn)) {
        return scheduler.getParamDescriptors(fn.v);
    }
    else if (typecheck(ThingType.implicitfunc)(fn)) {
        return IMPLICIT_SIGNATURE;
    }
    else if (typecheck(ThingType.continuation)(fn)) {
        return CONTINUATION_SIGNATURE;
    }
    const desc = scheduler.getApply(fn.t);
    if (desc) {
        return desc.params(fn);
    }
    return [];
}

export function getNthDescriptor(descriptors: ParamDescriptor[], index: number): ParamDescriptor {
    const atIndex = descriptors[index];
    if (atIndex) return atIndex;
    const final = last(descriptors);
    if (final && typecheck(ThingType.paramdescriptor)(final) && final.v[1]) return final;
    return NOT_A_PARAM;
}

function isField(index: keyof Thing<ThingType.paramdescriptor>["v"]): (descriptor: ParamDescriptor) => boolean {
    return descriptor => {
        if (isSymbol(descriptor)) return false;
        return descriptor.v[index] as boolean;
    }
}

export const isLazy = isField(0);

export const isSplat = isField(1);

const isUnwrap = isField(2);

function getExpectedTypes(descriptor: ParamDescriptor): ThingType[] {
    if (isSymbol(descriptor)) return [];
    return descriptor.c[1]?.c.map(c => c.v) ?? [];
}

function getDefaultValue(descriptor: ParamDescriptor, callsite: Thing): Thing | undefined {
    if (!isSymbol(descriptor)) {
        if (isSplat(descriptor)) return undefined;
        const def = descriptor.c[2];
        if (def) return def;
    }
    throw new RuntimeError("not enough arguments", callsite.loc);
}

function getParamName(descriptor: ParamDescriptor): Thing<ThingType.name> {
    if (isSymbol(descriptor)) return descriptor;
    return descriptor.c[0]!;
}

export function parametersToVars(functionName: string, paramsDef: ParamDescriptor[], realArgs: Thing[], callsite: Thing): { e: Thing<ThingType.map>, p: Thing[] } {
    const map = newEmptyMap(callsite.loc);
    const pendingDefaults: Thing[] = [];
    var i = 0;
    for (i = realArgs.length; i < paramsDef.length; i++) {
        // Remaining are the defaults yet to be evaluated
        const def = getDefaultValue(getNthDescriptor(paramsDef, i), callsite);
        if (def) pendingDefaults.push(def);
    }
    for (i = 0; i < realArgs.length; i++) {
        var arg = realArgs[i]!;
        const p = getNthDescriptor(paramsDef, i);
        if (p === NOT_A_PARAM) throw new RuntimeError(`too many arguments to ${functionName}`, arg.loc);
        const name = getParamName(p), t = getExpectedTypes(p);
        if (isLazy(p) && (t.length > 0 || isUnwrap(p)) && pendingDefaults.length === 0) {
            if (!typecheck(ThingType.implicitfunc)(arg)) {
                throw new Error("lazy param didn't get wrapped!");
            }
            arg = realArgs[i] = arg.c[0];
        }
        if (pendingDefaults.length > 0 || t.length === 0 || typecheck(...t)(arg)) {
            if (isSplat(p)) {
                const existingList = mapGetKey(map, name) ?? boxList([], arg.loc);
                mapUpdateKeyMutating(map, name, boxList([...existingList.c, arg], existingList.loc));
            } else {
                mapUpdateKeyMutating(map, name, arg);
            }
            continue;
        }
        const names = t.map(typeNameOf);
        const expected = names.join(names.length < 3 ? " or " : ", or ");
        throw new RuntimeError(`Wrong type to argument ${stringify(name.v)} of ${functionName} (expected ${expected}, got ${typeNameOf(arg.t)})`, arg.loc);
    }
    for (; pendingDefaults.length == 0 && i < paramsDef.length; i++) {
        const p = getNthDescriptor(paramsDef, i);
        const name = getParamName(p);
        if (isSplat(p)) {
            mapUpdateKeyMutating(map, name, boxList([]));
        }
    }
    return { e: map, p: pendingDefaults };
}

export function wrapImplicitBlock(obj: Thing, env: Thing<ThingType.env> | Thing<ThingType.nil>) {
    return new Thing(ThingType.implicitfunc, [obj], env, "", "", "", obj.loc);
}

export function parseSignature(block: readonly Thing[]): (Thing<ThingType.name> | Thing<ThingType.paramdescriptor>)[] {
    const result: any[] = [];
    var end: any[] = [];
    const tod = (match: Thing[], isSplat: boolean): Thing => {
        var items = removed_whitespace(match) as any[];
        var lazy = false, lazystr = "";
        if (typecheck(ThingType.operator)(items[0]!)) {
            lazy = true;
            lazystr = "@";
            items = items.slice(1);
        }
        var unwrap = false, poststr = isSplat ? "..." : "";
        if (typecheck(ThingType.operator)(items.at(-1)!)) {
            unwrap = true;
            poststr += "!";
            items = items.slice(0, -1);
        }
        const loc = items[0].loc;
        const to_type = (item: Thing): Thing[] => {
            if (typecheck(ThingType.squareblock)(item))
                return removed_whitespace(item.c).flatMap(c => to_type(c));
            if (isSymbol(item))
                return [boxNumber(typeNameToThingType(item.v, item.loc), item.loc, item.v)];
            return [];
        }
        const nil = boxNil(loc, "");
        const empty = boxList([], loc, "", "", "");
        const checkSplat = () => {
            if (isSplat) {
                throw new RuntimeError("a rest parameter cannot have a default", loc);
            }
        };
        const doType = () => {
            const type = to_type(items[2]);
            return boxList(type, items[2].loc, type.length > 1 ? "[" : "", type.length > 1 ? "]" : "", " ");
        }
        switch (items.length) {
            case 1:
                return lazy || isSplat || unwrap
                    ? new Thing(ThingType.paramdescriptor, [items[0], empty, nil], [lazy, isSplat, unwrap], lazystr, poststr, "", loc)
                    : items[0];
            case 5:
                checkSplat();
                return new Thing(ThingType.paramdescriptor, [items[0], doType(), items[4]], [lazy, isSplat, unwrap], lazystr, poststr, [":", "="] as any, loc);
            case 3:
                const isType = items[1].v === ":";
                if (!isType) checkSplat();
                return isType
                    ? new Thing(ThingType.paramdescriptor, [items[0], doType(), nil], [lazy, isSplat, unwrap], lazystr, poststr, ":", loc)
                    : new Thing(ThingType.paramdescriptor, [items[0], empty, items[2]], [lazy, isSplat, unwrap], lazystr, poststr, "=", loc);
            default:
                throw "unreachable";
        }
    }
    block = nonoverlappingreplace(block, splatEndPattern, match => {
        if (end.length > 0) {
            throw new RuntimeError("can only have 1 rest parameter", match[0]!.loc);
        }
        end.push(tod(match.slice(0, -3), true));
        return [];
    });
    for (var item of nonoverlappingreplace(block, signaturePattern, match => (result.push(tod(match, false)), []))) {
        throw new RuntimeError(`unexpected ${ThingType[item.t as any] ?? item.t}`, item.loc);
    }
    return [...result, ...end];
}

const base = "{@|}[p:name]{ : {[t:name]|[t:squareblock]}|}{ = d|} {!|} ";
const signaturePattern = p(base);
const splatEndPattern = p(`${base}[=.].. `);

