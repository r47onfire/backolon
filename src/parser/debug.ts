import { B_atLocation, JSFun } from "@r47onfire/jeb";
import { isArray } from "lib0/array";
import { GrammarCombinator } from "./combinator";

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

export const describe = (g: GrammarCombinator): string => {
    const describeInner = (g: GrammarCombinator, depth: number): string => {
        const c = (j = "") => g.c!.map(c => describeInner(c, depth + 1)).join(j);
        const j = () => describeInner(g.j!, depth + 1);
        if (depth > 3) return "...";
        switch (g.op) {
            case "tok": return isArray(g.v) ? "/" + g.v[0] + "/" + g.v[1] : JSON.stringify(g.v);
            case "rule": return g.v as string;
            case "tag": return "@" + g.v as string + "=" + c();
            case "ign": return "{" + c() + "}";
            case "opt": return "[" + c() + "]";
            case "seq": return "(" + c(" ") + ")";
            case "ssep": return j() + ".@(" + c(" ") + ")";
            case "alt": return c(" | ");
            case "joined": return c() + "." + j() + "+";
            case "rep": return j() + { r: "+", o: "*" }[g.f!];
            case "lookahead": return "(?" + { "+": "=", "-": "!" }[g.f!] + c() + ")";
            case "nonempty": return "(=" + c() + ")";
            case "sameline": return "($" + c() + ")";
            case "if": return "(?(" + j() + ") " + c(" | ") + ")";
            case "eps": return "\u03B5"; // epsilon
            case "try": return "(??" + c() + ")";
            case "cut": return "!";
            case "die": return depth > 0 ? "" : g.v as string;
        }
    }
    return (g.op === "die" ? "" : "expected ") + describeInner(g, 0);
}
