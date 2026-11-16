import { LinkedList, LinkedList_toArray } from "@r47onfire/game-math";
import { compressStackTree, StackTreeNode } from "./compress";
import { formatStackTraceCompact } from "./format";
import { BackolonErrorMessage } from "./messages";

/** Generic base class for an error thrown by a Backolon program. */
export class BaseBackolonError extends Error {
    constructor(
        message: BackolonErrorMessage,
        readonly offense?: any,
        readonly traceback: LinkedList<StackTreeNode> = null,
        readonly children: BaseBackolonError[] = [],
        options: ErrorOptions = {},
    ) {
        super(message, options);
        this.name = this.constructor.name;
    }
    toString(): string {
        return `${this.name}: ${this.message}${
            this.offense ? ": " + String(this.offense) : ""
        }\n${formatStackTraceCompact(
            compressStackTree(LinkedList_toArray(this.traceback)),
        )}${
            this.cause instanceof BaseBackolonError
                ? `\ncaused by: ${this.cause.toString()}`
                : ""
        }${this.children
            .map((c) =>
                c
                    .toString()
                    .split("\n")
                    .map((l) => "  " + l)
                    .join("\n"),
            )
            .join("\n\n")}`;
    }
}

export class RuntimeError extends BaseBackolonError {}
export class KeyboardInterrupt extends BaseBackolonError {}
export class BackolonError extends BaseBackolonError {}

export class BTypeError extends BackolonError {}
export class BValueError extends BackolonError {}
export class BNameError extends BackolonError {}
export class BSyntaxError extends BackolonError {}
export class NotImplementedError extends BackolonError {}

export class ImportError extends BackolonError {}
export class ModuleNotFoundError extends ImportError {}
export class CircularImportError extends ImportError {}
