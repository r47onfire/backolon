import { B_atLocation, JSFun } from "@r47onfire/jeb";
import { isArray } from "lib0/array";

/**
 * Deep-copies a value into a printable form for debugging, replacing JEB
 * runtime values that cannot be displayed: functions become "__name"
 * strings, and location-wrapped forms are unwrapped to their payload.
 */
export const stripInlinedFunctions = <T>(ast: T): T => {
    if (ast instanceof JSFun) {
        return "__" + ast.name.toString() as T;
    }
    if (isArray(ast)) {
        if (ast[0] === B_atLocation) {
            return stripInlinedFunctions(ast[2]);
        }
        return ast.map(x => stripInlinedFunctions(x)) as T;
    }
    if (typeof ast === "object" && ast !== null) {
        return Object.fromEntries(Object.entries(ast).map(e => [e[0], stripInlinedFunctions(e[1])])) as T;
    }
    return ast;
}
