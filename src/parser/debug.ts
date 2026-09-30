import { B_atLocation, JSFun } from "@r47onfire/jeb";
import { isArray } from "lib0/array";
import { GrammarCombinator, GrammarOp, lit, rep, seq } from "./combinator";
import { stringify } from "lib0/json";

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

const describe_formats: Record<GrammarOp, [string, join?: string, map?: Record<string, string>]> = {
    tok: ["v"],
    rule: ["r"],
    tag: ["#r=c"],
    ign: [",c"],
    opt: ["[c]"],
    seq: ["(c)", " "],
    ssep: ["j.@(c)", " "],
    alt: ["(c)", " | "],
    joined: ["j.c+"],
    rep: ["cf", , { r: "+", o: "*" }],
    lookahead: ["(?fc)", , { "+": "=", "-": "!" }],
    nonempty: ["(=c)"],
    sameline: ["($c)"],
    if: ["(?(j)c)", " | "],
    eps: ["\u03B5"],
    try: ["(??c)"],
    cut: ["!"],
    die: ["^v"]
}

export const describe = (g: GrammarCombinator): string => {
    const formatcode = describe_formats[g.op];
    return formatcode[0].replaceAll(/[vrcjf]/g, m => { // cSpell: ignore vrcjf
        switch (m as "v" | "r" | "c" | "j" | "f") {
            case "v": return isArray(g.v) ? "/" + g.v[0] + "/" + g.v[1] : stringify(g.v);
            case "r": return g.v as string;
            case "c": return g.c!.map(c => describe(c)).join(formatcode[1] ?? "");
            case "j": return describe(g.j!);
            case "f": return formatcode[2]![g.f as string] ?? "\uFFEF";
        }
    });
}
