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

export const describe = (g: GrammarCombinator, depth = 0): string => {
    if (depth > 3) return "...";
    switch (g.op) {
        case "token": return g.isRegex ? g.pattern.toString() : JSON.stringify(g.pattern);
        case "rule": return g.rule;
        case "tag": return "@" + g.tag + "=" + describe(g.node, depth + 1);
        case "ignored": return "{" + describe(g.node, depth + 1) + "}";
        case "optional": return "[" + describe(g.node, depth + 1) + "]";
        case "sequence": return "(" + g.nodes.map(n => describe(n, depth + 1)).join(" ") + ")";
        case "seq_sep": return describe(g.sep, depth + 1) + ".@(" + g.nodes.map(n => describe(n, depth + 1)).join(" ") + ")";
        case "alternatives": return g.nodes.map(n => describe(n, depth + 1)).join(" | ");
        case "joined": return describe(g.node, depth + 1) + "." + describe(g.sep, depth + 1) + "+";
        case "repeat": return describe(g.node, depth + 1) + (g.required ? "+" : "*");
        case "repeat_seq": return "(" + g.nodes.map(n => describe(n, depth + 1)).join(" ") + ")@" + (g.required ? "+" : "*");
        case "lookahead": return "(?" + (g.negative ? "!" : "=") + describe(g.node, depth + 1) + ")";
        case "assert_nonempty": return "(=" + describe(g.node, depth + 1) + ")";
        case "assert_sameline": return "($" + describe(g.node, depth + 1) + ")";
        case "if": return "(?(" + describe(g.cond, depth + 1) + ") " + describe(g.true, depth + 1) + " | " + describe(g.false, depth + 1) + ")";
        case "nothing": return "\u03B5";
        case "cut": return "!";
        case "fail_fast": return g.message;
    }
}
