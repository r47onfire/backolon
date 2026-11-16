import { StackEntryKind, StackTreeNode } from "./compress";

/**
 * Formats a stack tree as a compact string representation
 *
 * @param nodes The compressed stack tree nodes
 * @returns A formatted string like "foo <- bar <- (baz * 3) <- qux"
 */
export const formatStackTraceCompact = (
    nodes: readonly StackTreeNode[],
    joiner = "<-",
): string => {
    return nodes
        .map((item): string => {
            if (item.leaf) {
                switch (item.kind) {
                    case StackEntryKind.SYNTAX:
                        return "syntax in " + String(item.name);
                    case StackEntryKind.FUNCTION:
                        return String(item.name) || "<anonymous>";
                    case StackEntryKind.MACRO_EXPANSION_RESULT:
                        return `<macro ${String(item.name || "???")}>`;
                    case StackEntryKind.PARAMETER:
                        return "parameter " + String(item.name);
                    case StackEntryKind.CONTROL_FLOW:
                        return String(item.name);
                    default:
                        throw new Error(
                            "unknown stack entry kind " + item.kind,
                        );
                }
            }
            return `(${formatStackTraceCompact(item.children, joiner)} * ${item.count})`;
        })
        .join(joiner);
};
