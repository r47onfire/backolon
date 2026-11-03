import { boxApply } from "../objects/thing";
import {
    NativeModule,
    rewriteAsApply,
    symbol_x,
    symbol_y,
    symbol_z,
} from "./module";

/**
 * @module Builtins
 * @file
 */

export function control_flow(mod: NativeModule) {
    /**
     * Conditional branching.
     *
     * Evaluates condition; if truthy, evaluates true_expr, otherwise
     * false_expr.
     *
     * @category Control Flow
     * @example
     *     ```backolon
     *     if (x > 0) "positive" "non-positive"
     *     ```;
     *
     * @function if
     * @param cond
     * @param \@ifTrue
     * @param \@ifFalse - Defaults to `nil` if not provided
     * @backolon
     */
    mod.defun("if", "cond @ifTrue @ifFalse=nil", (task, state) => {
        // TODO: add op to convert value to boolean, currently lists and maps are always falsy since their .v is null
        const condition = state.argv[0]!;
        const ifTrue = state.argv[1]!;
        const ifFalse = state.argv[2]!;
        task.out();
        task.enter(
            boxApply(!!condition.v ? ifTrue : ifFalse, [], condition.loc),
            condition.loc,
            state.env,
        );
    });
    /**
     * C-style inline conditional. Equivalent to a call to `if`.
     *
     * @category Control Flow
     * @backolon
     * @syntax Ternary
     * @pattern cond ? ifTrue : ifFalse
     */
    mod.defsyntax(
        "x ? y : z",
        11,
        true,
        null,
        "__rewrite_ternary",
        rewriteAsApply([symbol_x, symbol_y, symbol_z], "if"),
    );
}
