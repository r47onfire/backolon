import { B_atLocation, JSFun } from "@r47onfire/jeb";
import { isArray } from "lib0/array";

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
