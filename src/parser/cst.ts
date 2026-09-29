import { GrammarCombinator } from "./combinator";

export type CSTNode = Readonly<{
    type?: string | undefined,
    ignored?: boolean,
    tag?: string | undefined,
    text?: string | undefined, // empty in non-leaf node
    transform?: string | undefined,
    start: number,
    end: number,
    children?: readonly CSTNode[], // empty in leaf node
    /** if set, it means this node is a fallback recovery node that should be translated into a lazy syntax error */
    errorExpected?: GrammarCombinator,
}>;
