export type GrammarCombinator = Readonly<
    /** consume a token of that type; produces a leaf */
    | { op: "token", type?: string, pattern: string, flags?: string, isRegex: boolean }
    /** node is trivial / no value */
    | { op: "ignored", node: GrammarCombinator }
    /** call the rule and return a node with the results */
    | { op: "rule", rule: string }
    /** return all results in an array */
    | { op: "sequence", nodes: GrammarCombinator[] }
    /** sequencing, but with optional sep surrounding them; sep is ignored */
    | { op: "seq_sep", nodes: GrammarCombinator[], sep: GrammarCombinator }
    /** repeat node separated by sep; sep is ignored */
    | { op: "joined", node: GrammarCombinator, sep: GrammarCombinator, require2: boolean, trailing: boolean }
    /** return the longest match out of the alternatives (first if there's multiple of the same length) */
    | { op: "alternatives", nodes: GrammarCombinator[] }
    /** return the parse result or blank */
    | { op: "optional", node: GrammarCombinator }
    /** return an array of the results */
    | { op: "repeat", required: boolean, node: GrammarCombinator }
    /** loops the sequence back into itself and flattens it */
    | { op: "repeat_seq", required: boolean, nodes: GrammarCombinator[] }
    /** conditional: match cond; if it matches, match true; else match false. cond is always a lookahead  */
    | { op: "if", cond: GrammarCombinator, true: GrammarCombinator, false: GrammarCombinator }
    /** tags the node */
    | { op: "tag", tag: string, node: GrammarCombinator }
    /** cut */
    | { op: "cut", depth: number }
    /** lookahead positive or negative */
    | { op: "lookahead", negative: boolean, node: GrammarCombinator }
    /** assert that we made progress */
    | { op: "assert_nonempty", node: GrammarCombinator }
    /** assert that the contents are all on the same line */
    | { op: "assert_sameline", node: GrammarCombinator }
    /** empty match */
    | { op: "nothing" }
    /** instantly fails */
    | { op: "fail_fast", message: string }
    /** speculative parse: any inner failure is downgraded to an ordinary failure, so enclosing alternatives can fall back */
    | { op: "try", node: GrammarCombinator }
>;

export const literal = (p: string, t?: string): GrammarCombinator => ({ op: "token", type: t, pattern: p, isRegex: false });
export const regex = (p: RegExp, t?: string): GrammarCombinator => ({ op: "token", type: t, pattern: p.source, flags: p.flags, isRegex: true });
export const ignored = (n: GrammarCombinator): GrammarCombinator => ({ op: "ignored", node: n });
export const rule = (r: string): GrammarCombinator => ({ op: "rule", rule: r });
export const sequence = (...n: GrammarCombinator[]): GrammarCombinator => ({ op: "sequence", nodes: n });
export const seq_sep = (s: GrammarCombinator, ...n: GrammarCombinator[]): GrammarCombinator => ({ op: "seq_sep", nodes: n, sep: s });
export const joined = (j: GrammarCombinator, n: GrammarCombinator, r2: boolean, t: boolean): GrammarCombinator => ({ op: "joined", node: n, sep: j, require2: r2, trailing: t });
export const alternatives = (...n: GrammarCombinator[]): GrammarCombinator => ({ op: "alternatives", nodes: n });
export const optional = (n: GrammarCombinator): GrammarCombinator => ({ op: "optional", node: n });
export const repeat = (r: boolean, n: GrammarCombinator): GrammarCombinator => ({ op: "repeat", required: r, node: n });
export const repeat_seq = (r: boolean, ...n: GrammarCombinator[]): GrammarCombinator => ({ op: "repeat_seq", required: r, nodes: n });
export const conditional = (c: GrammarCombinator, t: GrammarCombinator, f: GrammarCombinator): GrammarCombinator => ({ op: "if", cond: c, true: t, false: f });
export const tag = (t: string, n: GrammarCombinator): GrammarCombinator => ({ op: "tag", tag: t, node: n });
export const cut = (d = 1): GrammarCombinator => ({ op: "cut", depth: d });
export const lookahead = (n: GrammarCombinator): GrammarCombinator => ({ op: "lookahead", negative: false, node: n });
export const lookaheadNot = (n: GrammarCombinator): GrammarCombinator => ({ op: "lookahead", negative: true, node: n });
export const assert_nonempty = (n: GrammarCombinator): GrammarCombinator => ({ op: "assert_nonempty", node: n });
export const assert_sameline = (n: GrammarCombinator): GrammarCombinator => ({ op: "assert_sameline", node: n });
export const nothing = (): GrammarCombinator => ({ op: "nothing" });
export const fail_fast = (m: string): GrammarCombinator => ({ op: "fail_fast", message: m });
export const try_ = (n: GrammarCombinator): GrammarCombinator => ({ op: "try", node: n });
