export type Grammar = Readonly<Record<string, GrammarCombinator>>;

export type GrammarCombinator = {
    readonly op: GrammarOp;
    /**
     * Leaf payload:
     * - string: rule name, tag name, literal pattern, fail message
     * - [string, string]: regex [source, flags]
     * - number: cut depth
     */
    readonly v?: string | [string, string] | number;
    /**
     * All sub-combinators. Positional for multi-role ops:
     * - if: [cond, trueBranch, falseBranch]
     * - everything else: [node] or nodes directly
     */
    readonly c?: readonly GrammarCombinator[];
    /**
     * Aux/special non-sequential combinator
     * - ssep: separator
     * - joined: joiner
     * - if: condition
     */
    readonly j?: GrammarCombinator;
    /**
     * modifier flags, op-specific:
     * - rep: "o" or "r" for optional/required
     * - lookahead: "+" or "-" for positive or negative assertion
     * - joined: require2 is "2", trailing is "t"; presence
     */
    readonly f?: string;
    // /** cached structural hash */
    // hash?: number;
};
export type GrammarOp =
    /** consume a token of that type; produces a leaf */
    | "tok"
    /** node is trivial / no useful value */
    | "ign"
    /** call the rule and return a node with the results */
    | "rule"
    /** return all results in an array */
    | "seq"
    /** sequencing, but with optional sep surrounding them; sep is ignored */
    | "ssep"
    /** repeat node separated by sep; sep is ignored */
    | "joined"
    /** return the longest match out of the alternatives (first if there's multiple of the same length) */
    | "alt"
    /** return the parse result or blank */
    | "opt"
    /** return an array of the results; loops the sequence */
    | "rep"
    /** conditional: match cond; if it matches, match true; else match false. cond is always a lookahead  */
    | "if"
    /** tags the node */
    | "tag"
    /** cut */
    | "cut"
    /** lookahead positive or negative */
    | "lookahead"
    /** assert that we made progress */
    | "nonempty"
    /** assert that the contents are all on the same line */
    | "sameline"
    /** empty match */
    | "eps"
    /** instantly fails */
    | "die"
    /** speculative parse: any inner failure is downgraded to an ordinary failure, so enclosing alternatives can fall back */
    | "try"
    ;

export const lit = (p: string): GrammarCombinator => ({ op: "tok", v: p });
export const regex = (p: RegExp): GrammarCombinator => ({ op: "tok", v: [p.source, p.flags] });
export const ignored = (n: GrammarCombinator): GrammarCombinator => ({ op: "ign", c: [n] });
export const rule = (r: string): GrammarCombinator => ({ op: "rule", v: r });
export const seq = (...n: GrammarCombinator[]): GrammarCombinator => ({ op: "seq", c: n });
export const ssep = (s: GrammarCombinator, ...n: GrammarCombinator[]): GrammarCombinator => ({ op: "ssep", c: n, j: s });
export const joined = (j: GrammarCombinator, n: GrammarCombinator, r2: boolean, t: boolean): GrammarCombinator => ({ op: "joined", c: [n], j: j, f: (r2 ? "2" : "") + (t ? "t" : "") });
export const alt = (...n: GrammarCombinator[]): GrammarCombinator => ({ op: "alt", c: n });
export const opt = (n: GrammarCombinator): GrammarCombinator => ({ op: "opt", c: [n] });
export const rep = (r: boolean, n: GrammarCombinator): GrammarCombinator => ({ op: "rep", f: r ? "r" : "o", c: [n] });
export const if_ = (c: GrammarCombinator, t: GrammarCombinator, f: GrammarCombinator): GrammarCombinator => ({ op: "if", c: [t, f], j: c });
export const tag = (t: string, n: GrammarCombinator): GrammarCombinator => ({ op: "tag", v: t, c: [n] });
export const cut = (d = 1): GrammarCombinator => ({ op: "cut", v: d });
export const lookahead = (p: boolean, n: GrammarCombinator): GrammarCombinator => ({ op: "lookahead", f: p ? "+" : "-", c: [n] });
export const nonempty = (n: GrammarCombinator): GrammarCombinator => ({ op: "nonempty", c: [n] });
export const sameline = (n: GrammarCombinator): GrammarCombinator => ({ op: "sameline", c: [n] });
export const eps = (): GrammarCombinator => ({ op: "eps" });
export const die = (m: string): GrammarCombinator => ({ op: "die", v: m });
export const try_ = (n: GrammarCombinator): GrammarCombinator => ({ op: "try", c: [n] });
