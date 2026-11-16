import { isArray, last } from "lib0/array";
import { isString } from "lib0/function";
import { stringify } from "lib0/json";

// TODO: rewrite this to use a Nebula grammar

/**
 * Documentation tree markup node
 *
 * - I = italics
 * - B = bold
 * - P = paragraph
 * - C = inline code
 * - U = unordered list (bullets)
 * - O = ordered list (numbers)
 * - L = list item
 * - R = reference to another function/macro
 */
export type DocNode =
    | string
    | ["i", ...DocNode[]]
    | ["b", ...DocNode[]]
    | ["p", ...DocNode[]]
    | ["c", ...DocNode[]]
    | ["u", ...DocNode[]]
    | ["o", ...DocNode[]]
    | ["l", index: number | null, ...DocNode[]]
    | ["r", code: string]
    | ["r", display: string, group: string | undefined, path: string];

/** Documentation metadata tags, from header */
export interface DocMetadata {
    tag: string;
    type?: string;
    name?: DocNode;
    default?: string;
    flags?: string[];
    groups?: DocMetadata[];
    description?: DocNode[];
}

// TODO: rewrite this so that the parser gets the subtags, and can look at / process them

/**
 * Metadata parser that takes the lines on and after the tag and parses it into
 * a {@link DocMetadata}
 */
export type DocMetadataParser = (
    lines: string[],
    tag: string,
) => Omit<DocMetadata, "groups">;

/** Parser for a blank tag that only serves as a flag and carries no content. */
export const EmptyTag: DocMetadataParser = (lines, tag) => {
    if (lines.length)
        throw new Error(
            `${stringify(tag)} tag is just a flag and should have no content (received ${stringify(lines)})`,
        );
    return { tag };
};

/**
 * Creates a {@link DocMetadataParser} that asserts that there is tag content,
 * and that the first line matches the given regex. The regex match is passed to
 * the callback, and all remaining lines (including the rest of the first line
 * if the regex didn't match all of it) are passed to {@link parseParagraphs} to
 * form the tag description.
 *
 * @param regex Regex to match on the first line. It should be anchored to the
 *   start using `^`.
 * @param process The callback that will be called on a successful match and
 *   return the partial DocMetadata.
 * @returns The new parser
 */
export const firstLineRegex = (
    regex: RegExp,
    process: (
        match: RegExpExecArray,
    ) => Omit<DocMetadata, "tag" | "groups" | "description">,
): DocMetadataParser => {
    return (lines, tag) => {
        const firstLine = lines[0] ?? "",
            restLines = lines.slice(1);
        const match = regex.exec(firstLine);
        if (!match)
            throw new Error(
                lines.length
                    ? `Malformed ${stringify(tag)} tag: ${stringify(firstLine)}`
                    : `${stringify(tag)} tag requires content`,
            );
        const e = firstLine.slice(match[0].length);
        return {
            tag,
            description: parseParagraphs(
                e.length ? [e].concat(restLines) : restLines,
            ),
            ...process(match),
        };
    };
};

/**
 * Wraps the parser to print a warning (`console.warn()`) that the tag name is
 * not recommended or deprecated. The behavior is the same as the given parser
 * (the parameters are just passed directly).
 *
 * @param newName The preferred name that should be used instead
 * @param parser The implementation of the parser
 * @returns The wrapped parser
 */
export const deprecateTag = (
    newName: string,
    parser: DocMetadataParser,
): DocMetadataParser => {
    return (lines, tag) => {
        console.warn(
            `${stringify(tag)} is deprecated, use ${stringify(newName)} instead`,
        );
        return parser(lines, tag);
    };
};

/**
 * Parser for a param tag (pretty common) with the form `{type} name -
 * description` or `{type} [name=default] - description`
 */
export const ParamTag: DocMetadataParser = firstLineRegex(
    /^\s*(?:\{([^}]*)\}\s*)?(?:\[([^\]=]+)=([^\]]*)\]|([^\s-]+))\s*(-\s*)?/,
    (match) => {
        const { 1: type, 2: name, 4: name2, 3: default_ } = match;
        let fullName = name2 ?? name!;
        const flags: string[] = [];
        if (fullName.startsWith("@")) {
            flags.push("lazy");
            fullName = fullName.slice(1);
        }
        if (fullName.startsWith("^")) {
            flags.push("macro");
            fullName = fullName.slice(1);
        }
        if (fullName.startsWith("@") && !flags.includes("lazy")) {
            flags.push("lazy");
            fullName = fullName.slice(1);
        }
        if (fullName.endsWith("...")) {
            flags.push("rest");
            fullName = fullName.slice(0, -3);
        }
        return {
            type,
            name: fullName,
            flags,
            default: default_,
        };
    },
);

/** Parser for a returns tag (pretty common) with the form `{type} - description` */
export const ReturnsTag: DocMetadataParser = firstLineRegex(
    /^\s*(?:\{([^}]*)\}\s*)?\s*(-\s*)?/,
    (match) => {
        return {
            type: match[1],
        };
    },
);

/** Parser for a throws tag for throwing errors */
export const ThrowsTag: DocMetadataParser = firstLineRegex(
    /^\s*(\S+)\s*(-\s*)?/,
    (match) => {
        return {
            type: match[1],
            flags: ["error"],
        };
    },
);

/**
 * Splits a parameter list fragment into documentation nodes: bare words become
 * inline code, while parenthesised groups become italics.
 */
const parameterChunks = (s: string): DocNode[] => [
    ...s
        .matchAll(/\w+|(\(.+?\))/g)
        .map((part) => ["i", part[1] ? part[0] : ["c", part[0]]] as DocNode),
];

/** Metadata parsers used for the JEB stack machine opcode docstrings */
export const OpcodeParsers: Record<string, DocMetadataParser> = {
    // Immediate arguments documentation names
    imm: firstLineRegex(/^.*$/, (match) => {
        return { name: ["p", ...parameterChunks(match[0]! ?? "")] };
    }),
    // Param of immediate (should be level 2)
    param: ParamTag,
    // Property (for object types)
    prop: ParamTag,
    // Stack-effect diagram
    sed(lines, tag) {
        if (lines.length !== 1)
            throw new Error("expected 1 line to sed tag for opcode");
        const line = lines[0]!;
        const parts = line.split("--");
        if (parts.length !== 2)
            throw new Error(
                "expected -- to separate 2 halves in sed tag for opcode",
            );
        return {
            tag,
            description: [
                ...parameterChunks(parts[0]!),
                "--",
                ...parameterChunks(parts[1]!),
            ],
        };
    },
    // errors thrown
    throws: ThrowsTag,
};

/** Metadata parser for the func or macro tags */
export const FuncOrMacroTag: DocMetadataParser = (lines, tag) => {
    return {
        tag,
        name: [
            "p",
            ...lines[0]!
                .split(/\s+\|\s+/)
                .map((part) => ["c", part] as DocNode),
        ],
        description: parseParagraphs(lines.slice(1)),
    };
};

const deprecatedFunction = /* @__PURE__ */ deprecateTag("func", FuncOrMacroTag);
const deprecatedReturn = /* @__PURE__ */ deprecateTag("returns", ReturnsTag);

/** Metadata parsers used for the high(er)-level JEB function or macro docstrings */
export const FunctionOrMacroParsers: Record<string, DocMetadataParser> = {
    func: FuncOrMacroTag,
    macro: FuncOrMacroTag,
    function: deprecatedFunction,
    // code block gets a special var injected
    injected: ParamTag,
    // Param of function or macro
    param: ParamTag,
    // param that is a variable name gets assigned this value
    receives: ReturnsTag,
    // Property (for object types)
    prop: ParamTag,
    // errors thrown
    throws: ThrowsTag,
    // Returns value
    return: deprecatedReturn,
    returns: ReturnsTag,
    // present if the function is marked as pure
    pure: EmptyTag,
};

/** Parsed documentation data for something (e.g. builtin function, lambda) */
export interface Doc {
    /** Rendered header data */
    meta: DocMetadata[];
    /** Rendered body documentation data. each outer list is a single paragraph */
    body: DocNode[];
}

/** Interface for a thing that has a docstring. */
export interface HasDocstring {
    readonly doc: string;
}

/**
 * Parse the documentation string into {@link Doc} data
 *
 * @returns The doc data, or undefined if it didn't parse right
 */
export const parseDoc = (
    docstring: string,
    parsers: Record<string, DocMetadataParser>,
): Doc | undefined => {
    docstring = docstring
        .split("\n")
        .map((s) => s.trimEnd())
        .join("\n");
    if (!docstring) return undefined;
    const lines = docstring!.split("\n");
    const { 0: meta, 1: summaryLines } = parseHeaderAndSummary(lines, parsers);
    const body = parseParagraphs(summaryLines);
    return { meta, body };
};

const enum ParagraphState {
    PARAGRAPH,
    NUMBERED_LIST,
    BULLETED_LIST,
}

/**
 * Parses the lines and creates ordered and unordered lists for groups of lines
 * with bullets or number and creates paragraphs for all other lines
 */
export const parseParagraphs = (lines: string[]): DocNode[] => {
    let state: ParagraphState = ParagraphState.PARAGRAPH;
    const items: DocNode[] = [];
    let currentList: DocNode | undefined, match: RegExpExecArray | null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.startsWith("* ")) {
            if (state !== ParagraphState.BULLETED_LIST) {
                currentList = ["u"];
                items.push(currentList!);
            }
            (currentList as DocNode[])!.push([
                "l",
                null,
                ...parseInline(line.slice(2)),
            ]);
            state = ParagraphState.BULLETED_LIST;
        } else if ((match = /^\d*\.\s/.exec(line)) !== null) {
            if (state !== ParagraphState.NUMBERED_LIST) {
                currentList = ["o"];
                items.push(currentList!);
            }
            (currentList as DocNode[])!.push([
                "l",
                parseInt(match[0]),
                ...parseInline(line.slice(match[0].length)),
            ]);
            state = ParagraphState.NUMBERED_LIST;
        } else {
            items.push(["p", ...parseInline(line)]);
            state = ParagraphState.PARAGRAPH;
        }
    }
    return items;
};

/**
 * Parses the hiearchal metadata tags from the lines and returns the tree of
 * {@link DocMetadata} nodes as well as all the lines that were untagged or
 * tagged with `""` as the global summary
 */
export const parseHeaderAndSummary = (
    lines: string[],
    parsers: Record<string, DocMetadataParser>,
): [DocMetadata[], string[]] => {
    let currentLevel = 1;
    const tags: DocMetadata[] = [];
    const summaryLines: string[] = [];
    let currentArray = tags;
    const stack: DocMetadata[][] = [];
    let tagLinesBuffer: string[] = [];
    let firstLine: string;
    let accumulatingTagLevel = 1;
    let accumulatingTagName = "";
    const flush = () => {
        if (accumulatingTagName === "" && accumulatingTagLevel === 1) {
            summaryLines.push(...tagLinesBuffer);
            tagLinesBuffer = [];
            return;
        }
        const parser = parsers[accumulatingTagName];
        if (!parser)
            throw new Error("unknown tag " + stringify(accumulatingTagName));
        if (accumulatingTagLevel > currentLevel) {
            currentLevel++;
            if (accumulatingTagLevel !== currentLevel)
                throw new Error(
                    `can only go up one level at a time (was at level ${currentLevel - 1} but jumped up to level ${accumulatingTagLevel}): ${stringify(firstLine)}`,
                );
            const item = last(currentArray);
            stack.push(currentArray);
            currentArray = item.groups ??= [];
        } else
            while (currentLevel > accumulatingTagLevel) {
                currentArray = stack.pop()!;
                currentLevel--;
            }
        currentArray.push(parser(tagLinesBuffer, accumulatingTagName));
        tagLinesBuffer = [];
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const match = /^(\.+)(\w*)(.*)$/.exec(line);
        if (!match) {
            tagLinesBuffer.push(line);
            continue;
        }
        flush();
        const dots = match[1]!,
            tag = match[2]!,
            rest = match[3]!;
        firstLine = line;
        accumulatingTagLevel = dots.length;
        accumulatingTagName = tag;
        const trimmed = rest.trimStart();
        if (trimmed) tagLinesBuffer.push(trimmed);
    }
    flush();
    return [tags, summaryLines];
};

/**
 * Parses the inline markup of a single line into {@link DocNode}s. Supports
 * `**bold**`, `*italic*`, `` `code` ``, and `[[reference]]`s (optionally
 * `[[display#path]]` or `[[display#group:path]]`); a backslash escapes the
 * following character so it is treated as literal text.
 */
export const parseInline = (s: string): DocNode[] => {
    const root = [0] as any as DocNode[];
    const stack: DocNode[][] = [root];
    let i = 0;

    const pushText = (t: string) => {
        if (t) {
            const a = last(stack);
            if (a.length < 2 || !isString(last(a))) {
                a.push(t);
            } else {
                a.push(a.pop() + t);
            }
        }
    };
    const startNode = (t: Exclude<Exclude<DocNode, string>[0], "r" | "l">) => {
        const n: DocNode = [t];
        last(stack)!.push(n);
        stack.push(n as DocNode[]);
    };

    while (i < s.length) {
        // escaped character
        if (s.startsWith("\\", i)) {
            pushText(s[i + 1]!);
            i += 2;
            continue;
        }
        // [[ref]]
        // [[ref#link]]
        // [[ref#group:link]]
        if (s.startsWith("[[", i)) {
            const j = s.indexOf("]]", i);
            if (j !== -1) {
                const full = s.slice(i + 2, j);
                const match = /^(.+?)#(?:(.+?):)?(.+)$/.exec(full);
                if (!match) {
                    last(stack).push(["r", full]);
                } else {
                    last(stack).push(["r", match[1]!, match[2]!, match[3]!]);
                }
                i = j + 2;
                continue;
            }
        }
        // **bold**
        if (s.startsWith("**", i)) {
            const top = last(stack)! as DocNode;
            if (isArray(top) && top[0] === "b") stack.pop();
            else startNode("b");
            i += 2;
            continue;
        }
        // *italic*
        if (s.startsWith("*", i)) {
            const top = last(stack)! as DocNode;
            if (isArray(top) && top[0] === "i") stack.pop();
            else startNode("i");
            i++;
            continue;
        }
        // `code`
        if (s.startsWith("`", i)) {
            const top = last(stack)! as DocNode;
            if (isArray(top) && top[0] === "c") stack.pop();
            else startNode("c");
            i++;
            continue;
        }
        // plain text to next delimiter
        const next = s.slice(i).search(/(\*\*|[*`]|\[\[|\\)/);
        const end = next === -1 ? s.length : i + next;
        pushText(s.slice(i, end));
        i = end;
    }
    return root.slice(1) as DocNode[];
};
