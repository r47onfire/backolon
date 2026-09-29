import { GrammarCombinator } from "./combinator";

export type CSTNode = Readonly<{
    /** functional type for AST generation */
    type?: string | undefined,
    /** true if this node is meaningless junk that does not change the AST (commas, parens, whitespace/comments) */
    ignored?: boolean,
    /** visual kind for syntax highlighting */
    tag?: string | undefined,
    /** text of this node; empty if a non-leaf */
    text?: string | undefined,
    /** start of the span that this node covers. */
    start: number,
    /** end of the span that this node covers. */
    end: number,
    children?: readonly CSTNode[], // empty in leaf node
    /** if set, it means this node is a fallback recovery node that should be translated into a lazy syntax error */
    errorExpected?: GrammarCombinator,
}>;
