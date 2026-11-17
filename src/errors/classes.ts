import { LinkedList, LinkedList_toArray } from "@r47onfire/game-math";
import { compressStackTree, StackTreeNode } from "./compress";
import { formatStackTraceCompact } from "./format";
import { BackolonErrorMessage } from "./messages";

/** Generic base class for an error thrown by a Backolon program. */
export class BaseBackolonError extends Error {
    constructor(
        message: BackolonErrorMessage,
        readonly offense?: any,
        public traceback: LinkedList<StackTreeNode> = null,
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

/** Something very unexpected went wrong. */
export class RuntimeError extends BaseBackolonError {}
/** The user pressed the stop button. */
export class KeyboardInterrupt extends BaseBackolonError {}

/** Base for all normal errors. */
export class BackolonError extends BaseBackolonError {}

/** Wrong type of value (e.g. expected a number, got string). */
export class BTypeError extends BackolonError {}
/**
 * Correct type, but invalid in some other way (e.g. repeating a sequence a
 * non-integer number of times).
 */
export class BValueError extends BackolonError {}
/** Variable not found. */
export class BNameError extends BackolonError {}
/** Unparseable syntax or bad usage. */
export class BSyntaxError extends BackolonError {}
/** Function is not implemented. */
export class NotImplementedError extends BackolonError {}

/** Base class for errors that occur when importing a module. */
export class ImportError extends BackolonError {}
/** The requested module doesn't exist. */
export class ModuleNotFoundError extends ImportError {}
/** The module tried to (directly or indirectly) import itself. */
export class CircularImportError extends ImportError {}
