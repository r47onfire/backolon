export type GrammarCombinator = Readonly<
    /** consume a token of that type; produces a leaf */
    | { op: "token", type?: string, pattern: string, flags?: string, isRegex: boolean }
    /** call the rule and return a node with the results */
    | { op: "rule", rule: string }
    /** takes the node to be transformed */
    | { op: "transform", transformer: string, node: GrammarCombinator }
    /** return all results in an array */
    | { op: "sequence", nodes: GrammarCombinator[] }
    /** return the longest match out of the alternatives (first if there's multiple of the same length) */
    | { op: "alternatives", nodes: GrammarCombinator[] }
    /** return the parse result or blank */
    | { op: "optional", greedy: boolean, node: GrammarCombinator }
    /** return an array of the results */
    | { op: "repeat", required: boolean, node: GrammarCombinator }
    /** loops the sequence back into itself and flattens it */
    | { op: "repeat_seq", required: boolean, nodes: GrammarCombinator[] }
    /** tags the node */
    | { op: "tag", tag: string, node: GrammarCombinator }
    /** cut */
    | { op: "cut", depth: number }
    /** lookahead positive or negative */
    | { op: "lookahead", negative: boolean, node: GrammarCombinator }
    /** assert that we made progress */
    | { op: "assert_nonempty", node: GrammarCombinator }
    /** empty match */
    | { op: "epsilon" }
    /** instantly fails */
    | { op: "fail_fast", message: string }
>;

export const literal = (p: string, t?: string): GrammarCombinator => ({ op: "token", type: t, pattern: p, isRegex: false });
export const regex = (p: RegExp, t: string): GrammarCombinator => ({ op: "token", type: t, pattern: p.source, flags: p.flags, isRegex: true });
export const rule = (r: string): GrammarCombinator => ({ op: "rule", rule: r });
export const transform = (t: string, n: GrammarCombinator): GrammarCombinator => ({ op: "transform", transformer: t, node: n });
export const sequence = (...n: GrammarCombinator[]): GrammarCombinator => ({ op: "sequence", nodes: n });
export const alternatives = (...n: GrammarCombinator[]): GrammarCombinator => ({ op: "alternatives", nodes: n });
export const optional = (g: boolean, n: GrammarCombinator): GrammarCombinator => ({ op: "optional", greedy: g, node: n });
export const repeat = (r: boolean, n: GrammarCombinator): GrammarCombinator => ({ op: "repeat", required: r, node: n });
export const repeat_seq = (r: boolean, ...n: GrammarCombinator[]): GrammarCombinator => ({ op: "repeat_seq", required: r, nodes: n });
export const tag = (t: string, n: GrammarCombinator): GrammarCombinator => ({ op: "tag", tag: t, node: n });
export const cut = (d = 1): GrammarCombinator => ({ op: "cut", depth: d });
export const lookahead = (n: GrammarCombinator): GrammarCombinator => ({ op: "lookahead", negative: false, node: n });
export const lookaheadNot = (n: GrammarCombinator): GrammarCombinator => ({ op: "lookahead", negative: true, node: n });
export const assert_nonempty = (n: GrammarCombinator): GrammarCombinator => ({ op: "assert_nonempty", node: n });
export const epsilon = (): GrammarCombinator => ({ op: "epsilon" });
export const fail_fast = (m: string): GrammarCombinator => ({ op: "fail_fast", message: m });
