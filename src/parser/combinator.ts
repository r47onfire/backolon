/** A grammar: rule names mapped to their definitions. */
export type Grammar = Readonly<Record<string, GrammarCombinator>>;

/**
 * A single grammar node. Combinators are plain serializable data (no functions),
 * so grammars can be built, inspected, and patched as values.
 */
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
/**
 * The operation a {@link GrammarCombinator} performs; determines how the
 * parser interprets the node's payload (`v`), children (`c`), and
 * auxiliary combinator (`j`).
 */
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

/** Matches the literal string `p` exactly; produces a leaf holding that text. */
export const lit = (p: string): GrammarCombinator => ({ op: "tok", v: p });
/** Matches the regex `p` anchored at the current position (the engine adds the sticky flag); produces a leaf holding the matched text. The pattern is stored as `[source, flags]` to keep combinators plain data. */
export const regex = (p: RegExp): GrammarCombinator => ({ op: "tok", v: [p.source, p.flags] });
/** Parses `n` but flags the result `ignored`: its text stays in the CST (so concatenating all leaves still reproduces the source) and it is dropped later, when the CST is lowered to an AST. */
export const ignored = (n: GrammarCombinator): GrammarCombinator => ({ op: "ign", c: [n] });
/** Invokes the named rule `r` from the grammar; the result is wrapped in a node typed `r`, unless the rule only delegated to another named rule. */
export const rule = (r: string): GrammarCombinator => ({ op: "rule", v: r });
/** Matches all of `n` in order; the result is a flat node holding every child's result. */
export const seq = (...n: GrammarCombinator[]): GrammarCombinator => ({ op: "seq", c: n });
/** Like `seq`, but the separator `s` is attempted before, between, and after the items; separator results are marked ignored. */
export const ssep = (s: GrammarCombinator, ...n: GrammarCombinator[]): GrammarCombinator => ({ op: "ssep", c: n, j: s });
/** Matches `n` separated by `j` (`n`, `n` j `n`, ...), keeping elements and separators in one flat result. `r2` requires at least two elements; `t` permits a trailing separator. */
export const joined = (j: GrammarCombinator, n: GrammarCombinator, r2: boolean, t: boolean): GrammarCombinator => ({ op: "joined", c: [n], j: j, f: (r2 ? "2" : "") + (t ? "t" : "") });
/** Tries every alternative and keeps the longest match (the first, on ties). */
export const alt = (...n: GrammarCombinator[]): GrammarCombinator => ({ op: "alt", c: n });
/** Matches `n` if it succeeds, otherwise succeeds empty — unless `n` failed after a cut, in which case the failure propagates. */
export const opt = (n: GrammarCombinator): GrammarCombinator => ({ op: "opt", c: [n] });
/** Repeats `n` greedily until it fails ordinarily; `r` = true requires at least one match, false allows zero. */
export const rep = (r: boolean, n: GrammarCombinator): GrammarCombinator => ({ op: "rep", f: r ? "r" : "o", c: [n] });
/** Conditional: evaluates `c` as a lookahead (consuming no input); matches `t` if it succeeds, `f` otherwise. */
export const if_ = (c: GrammarCombinator, t: GrammarCombinator, f: GrammarCombinator): GrammarCombinator => ({ op: "if", c: [t, f], j: c });
/** Parses `n` and tags the result with `t` (the visual kind used for syntax highlighting). */
export const tag = (t: string, n: GrammarCombinator): GrammarCombinator => ({ op: "tag", v: t, c: [n] });
/** Cut: once matched, a later failure no longer falls back to sibling alternatives; `d` is how many enclosing choice levels the commitment spans. Produces an empty ignored node. */
export const cut = (d = 1): GrammarCombinator => ({ op: "cut", v: d });
/** Asserts that `n` matches (`p` = true) or does not match (`p` = false) at the current position, consuming no input. */
export const lookahead = (p: boolean, n: GrammarCombinator): GrammarCombinator => ({ op: "lookahead", f: p ? "+" : "-", c: [n] });
/** Parses `n` and fails if it matched without consuming any input. */
export const nonempty = (n: GrammarCombinator): GrammarCombinator => ({ op: "nonempty", c: [n] });
/** Parses `n` and fails if the matched span contains a newline. */
export const sameline = (n: GrammarCombinator): GrammarCombinator => ({ op: "sameline", c: [n] });
/** Always matches, consuming no input. */
export const eps = (): GrammarCombinator => ({ op: "eps" });
/** Always fails, with `m` naming what was expected. The failure carries an infinite cut, so no alternative or recovery is attempted past it. */
export const die = (m: string): GrammarCombinator => ({ op: "die", v: m });
/** Parses `n` speculatively: if `n` fails, any cut inside it is hidden, so the failure looks ordinary and enclosing alternatives can still fall back. */
export const try_ = (n: GrammarCombinator): GrammarCombinator => ({ op: "try", c: [n] });
