import { undefinedToNull } from "lib0/conditions";
import { isArray, isNumber, isString } from "lib0/function";
import { stringify } from "lib0/json";
import { RuntimeError, UNKNOWN_LOCATION } from "../errors";
import { mapUpdateKeyMutating, newEmptyMap } from "./map";
import {
    boxList,
    boxNil,
    boxNumber,
    boxString,
    Thing,
    ThingType,
    typeNameOf
} from "./thing";

/**
 * Internal wrapper for native JavaScript objects stored in Backolon values.
 */
export class JSObjectRef {
    constructor(public value: any, public self: any | null) { }
}

/**
 * Type tag used for JavaScript object references.
 * (String instead of ThingType enum since the FFI module is separate.)
 */
export const JSObjectType = "js_object";

/**
 * Convert a Backolon Thing into a native JavaScript value.
 */
export function toJS(thing: Thing) {
    return toJSInner(thing, new WeakMap);
}
function toJSInner(thing: Thing, visited: WeakMap<Thing, any>): any {
    if (visited.has(thing)) {
        return visited.get(thing);
    }
    switch (thing.t) {
        case ThingType.nil:
            return null;
        case ThingType.number:
            return thing.v;
        case ThingType.string:
            return thing.v;
        case ThingType.list: {
            const arr: any[] = [];
            visited.set(thing, arr);
            arr.push(...thing.c.map(t => toJSInner(t, visited)));
            return arr;
        }
        case ThingType.map: {
            const obj: any = {};
            visited.set(thing, obj);
            for (const pair of thing.c) {
                const key = toJSInner(pair.c[0]!, visited);
                const value = toJSInner(pair.c[1]!, visited);
                obj[key] = value;
            }
            return obj;
        }
        case JSObjectType:
            return (thing.v as JSObjectRef).value;
        case ThingType.name:
            // Symbols can be converted to strings for JS land
            return thing.v;
        default:
            throw new RuntimeError(`no JS object equivalent for ${typeNameOf(thing.t)}`, thing.loc);
    }
}

/**
 * Convert a native JavaScript value into a Backolon Thing.
 */
export function fromJS(val: any, loc = UNKNOWN_LOCATION): Thing {
    return fromJSInner(val, loc, new WeakMap);
}
function fromJSInner(val: any, loc = UNKNOWN_LOCATION, visited = new WeakMap()): Thing {
    if (undefinedToNull(val) === null) {
        return boxNil(loc);
    }
    if (isNumber(val) || typeof val === "bigint") {
        return boxNumber(val, loc);
    }
    if (isString(val)) {
        return boxString(val, loc, stringify(val), "");
    }
    if (typeof val === "boolean") {
        return boxNumber(val ? 1 : 0, loc);
    }
    if (visited.has(val)) {
        // Cycle detected, return the already created Thing
        return visited.get(val)!;
    }
    if (isArray(val)) {
        const result = boxList([], loc);
        visited.set(val, result);
        result.c.push(...val.map((v) => fromJSInner(v, loc, visited)));
        return result;
    }
    if (typeof val === "object"
        && val.constructor === Object
        && Object.prototype.toString.call(val) === "[object Object]"
        && val !== globalThis) {
        const map = newEmptyMap(loc);
        visited.set(val, map);
        for (const [k, v] of Object.entries(val)) {
            const keyThing = boxString(k, loc, k, '"');
            const valueThing = fromJSInner(v, loc, visited);
            mapUpdateKeyMutating(map, keyThing, valueThing, loc);
        }
        return map;
    }
    // For other types (functions, symbols, etc), create a reference
    return new Thing(JSObjectType, [], new JSObjectRef(val, null), `<object ${val}>`, "", "", loc, false);
}
