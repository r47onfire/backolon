import { GrammarCombinator } from "./combinator";

/**
 * A node of the concrete syntax tree produced by the parser.
 *
 * Invariant: recursively concatenating the `text` of all leaves -- including
 * `ignored` nodes -- reproduces the original source exactly. Ignored nodes are
 * only removed in a later pass, when the CST is lowered to an AST.
 */
export type CSTNode = Readonly<{
    /** Functional type for AST generation */
    type?: string | undefined;
    /**
     * True if this node is meaningless junk that does not change the AST
     * (commas, parens, whitespace/comments)
     */
    ignored?: boolean;
    /** Visual kind for syntax highlighting */
    tag?: string | undefined;
    /** Text of this node; empty if a non-leaf */
    text?: string | undefined;
    /** Start of the span that this node covers. */
    start: number;
    /** End of the span that this node covers. */
    end: number;
    children?: readonly CSTNode[]; // empty in leaf node
    /**
     * If set, it means this node is a fallback recovery node that should be
     * translated into a lazy syntax error
     */
    errorExpected?: GrammarCombinator;
}>;
