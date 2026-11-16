import { javaHash, rotate32 } from "@r47onfire/game-math";
import { locationsEqual, Span } from "@r47onfire/nebula";
import { Identifier } from "../utils";

export const enum StackEntryKind {
    SYNTAX,
    FUNCTION,
    MACRO_EXPANSION_RESULT,
    PARAMETER,
    CONTROL_FLOW,
}

/** Tree node representing a compressed stack trace */
export type StackTreeNode = Readonly<
    | {
          leaf: false;
          count: number;
          children: StackTreeNode[];
          hash: number;
      }
    | {
          leaf: true;
          name: Identifier | undefined;
          location: Span | undefined;
          kind: StackEntryKind;
          hash: number;
      }
>;

/**
 * Creates a leaf stack tree node for a single call frame. The node's hash is
 * precomputed from the frame name and location so that equal frames can be
 * recognized (and folded together) by {@link compressStackTree}.
 */
export const createStackLeafNode = (
    name: Identifier | undefined,
    location: Span | undefined,
    kind: StackEntryKind,
): StackTreeNode => {
    return {
        leaf: true,
        name,
        location,
        kind,
        hash:
            javaHash(String(name)) ^
            (location
                ? rotate32(javaHash(location.file.href), 11) ^
                  rotate32(location.begin, 23) ^
                  rotate32(location.end, 11)
                : 0xdeadbeef) ^
            rotate32(kind, 21),
    };
};

/**
 * Creates an inner stack tree node representing `count` repetitions of the
 * given child frames, with its hash precomputed from the children's hashes.
 */
export const createStackInnerNode = (
    count: number,
    children: StackTreeNode[],
): StackTreeNode => {
    return {
        leaf: false,
        count,
        children,
        hash: children.reduce(
            (prev, { hash }) => rotate32(prev, 17) ^ hash,
            0x24354657,
        ),
    };
};

/**
 * Compresses a list of stack frames by folding each run of consecutively
 * repeating frame patterns into a single inner node (see {@link StackTreeNode}),
 * recursively, so that tracebacks of deeply recursive programs stay readable.
 */
export const compressStackTree = (nodes: StackTreeNode[]): StackTreeNode[] => {
    const len = nodes.length;
    if (len === 0) return [];

    const result: StackTreeNode[] = [];

    for (var i = 0; i < len;) {
        // Find the best repeating pattern starting at position i
        var bestLen = 1,
            bestCount = 1;

        // Try pattern lengths from 1 to half the remaining array
        const maxPatternLen = ((len - i) / 2) | 0;
        for (var patternLen = 1; patternLen <= maxPatternLen; patternLen++) {
            var repeatCount = 1;

            // Count how many consecutive times this pattern repeats
            while (
                i + patternLen * (repeatCount + 1) <= len &&
                patternsEqual(
                    nodes,
                    i,
                    i + patternLen * repeatCount,
                    patternLen,
                )
            )
                repeatCount++;

            // Keep the match that repeats most times (tiebreak by longer pattern)
            if (
                repeatCount > 1 &&
                (repeatCount > bestCount ||
                    (repeatCount === bestCount && patternLen > bestLen))
            ) {
                bestLen = patternLen;
                bestCount = repeatCount;
            }
        }

        if (bestCount > 1) {
            // Create a compressed node containing the repeating pattern
            result.push(
                createStackInnerNode(
                    bestCount,
                    compressStackTree(nodes.slice(i, i + bestLen)),
                ),
            );
            i += bestLen * bestCount;
        } else {
            // No repeating pattern; recursively compress children if non-leaf
            const node = nodes[i]!;
            result.push(
                node.leaf
                    ? node
                    : createStackInnerNode(
                          node.count,
                          compressStackTree(node.children),
                      ),
            );
            i++;
        }
    }
    return result;
};

const patternsEqual = (
    nodes: StackTreeNode[],
    offset1: number,
    offset2: number,
    length: number,
): boolean => {
    for (var i = 0; i < length; i++) {
        if (!nodesEqual(nodes[offset1 + i]!, nodes[offset2 + i]!)) {
            return false;
        }
    }
    return true;
};

const nodesEqual = (node1: StackTreeNode, node2: StackTreeNode) => {
    // quick compare
    if (node1.hash !== node2.hash) return false;

    // either they're equal, or hash collision
    if (node1.leaf && node2.leaf) {
        if (node1.name !== node2.name) return false;
        if (node1.kind !== node2.kind) return false;
        return locationsEqual(node1.location, node2.location);
    }
    if (!node1.leaf && !node2.leaf) {
        // For non-leaf nodes, count and structure must match
        return (
            node1.count === node2.count &&
            childrenEqual(node1.children, node2.children)
        );
    }
    return false;
};

const childrenEqual = (
    children1: StackTreeNode[],
    children2: StackTreeNode[],
): boolean => {
    return (
        children1.length === children2.length &&
        children1.every((child1, i) => nodesEqual(child1, children2[i]!))
    );
};
