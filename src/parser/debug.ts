import { B_atLocation, JSFun } from "@r47onfire/jeb";
import { isArray } from "lib0/array";
import { GrammarCombinator, GrammarOp } from "./combinator";
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

/** Renderers for {@link describe}, one per op, each producing that op's compact PEG-like notation from its explicitly named fields. */
const describe_formats: Record<GrammarOp, (node: any) => string> = {
    tok: node => isArray(node.pattern) ? "/" + node.pattern[0] + "/" + node.pattern[1] : stringify(node.pattern),
    kw: node => "('" + (node.options as string[]).join("' | '") + "')",
    rule: node => node.name,
    param: node => "$" + node.name,
    ambient: node => "@" + node.name,
    bind: node => "&" + node.name + " " + describe(node.value) + " = " + describe(node.body),
    tag: node => "#" + node.tag + "=" + describe(node.child),
    ign: node => "," + describe(node.child),
    opt: node => "[" + describe(node.child) + "]",
    seq: node => "(" + (node.items as GrammarCombinator[]).map(c => describe(c)).join(" ") + ")",
    ssep: node => describe(node.separator) + ".@(" + (node.items as GrammarCombinator[]).map(c => describe(c)).join(" ") + ")",
    alt: node => "(" + (node.options as GrammarCombinator[]).map(c => describe(c)).join(" | ") + ")",
    joined: node => describe(node.joiner) + "." + describe(node.element) + "+",
    rep: node => (node.items as GrammarCombinator[]).map(c => describe(c)).join("") + (node.required ? "+" : "*"),
    lookahead: node => "(?" + (node.positive ? "=" : "!") + describe(node.child) + ")",
    nonempty: node => "(=" + describe(node.child) + ")",
    sameline: node => "($" + describe(node.child) + ")",
    if: node => "(?(" + describe(node.condition) + ")" + describe(node.if_true) + " | " + describe(node.if_false) + ")",
    eps: () => "\u03B5",
    try: node => "(??" + describe(node.child) + ")",
    cut: () => "!",
    die: node => "^" + stringify(node.message),
};

/** Renders a combinator in a compact PEG-like notation, for debugging grammars. */
export const describe = (g: GrammarCombinator): string => describe_formats[g.op](g);
