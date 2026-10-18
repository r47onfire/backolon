import { B_atLocation, JSFun } from "@r47onfire/jeb";
import { isArray } from "lib0/array";
import { GrammarCombinator, GrammarOp, lit, rep, seq } from "./combinator";
import { stringify } from "lib0/json";

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

/**
 * Rendering templates for `describe`, one per op. Letters in a template are
 * substituted: v = payload, r = rule name, c = children (joined by the
 * optional second element), j = aux combinator, f = flag (translated through
 * the optional third element).
 */
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

/** Renders a combinator in a compact PEG-like notation, for debugging grammars. */
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
