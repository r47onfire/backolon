export type CSTNode = Readonly<{
    type?: string | undefined,
    tag?: string | undefined,
    text?: string | undefined, // empty in non-leaf node
    transform?: string | undefined,
    start: number,
    end: number,
    children?: readonly CSTNode[], // empty in leaf node
}>;
