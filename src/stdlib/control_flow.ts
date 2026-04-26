import { boxApply } from "../objects/thing";
import { BooleanState, BUILTIN_TO_BOOLEAN } from "./logic";
import { NativeModule, rewriteAsApply, symbol_x, symbol_y, symbol_z } from "./module";

/**
 * @file
 * @module Builtins
 */

export function control_flow(mod: NativeModule) {
    /**
     * Conditional branching.
     *
     * Evaluates condition; if truthy, evaluates true_expr, otherwise false_expr.
     * @backolon
     * @category Control Flow
     * @function if
     * @param cond
     * @param \@ifTrue
     * @param \@ifFalse - defaults to `nil` if not provided
     * @example
     * ```backolon
     * if (x > 0) "positive" "non-positive"
     * ```
     */
    mod.defun("if", "cond @ifTrue @ifFalse=nil", (task, state) => {
        const { argv, loc, env, cookie } = state;
        switch (cookie as BooleanState) {
            case BooleanState.initial:
                task.updateCookie(0, BooleanState.got_first_truthiness);
                task.enter(boxApply(BUILTIN_TO_BOOLEAN, [argv[0]!], loc), loc, env);
                return;
            case BooleanState.got_first_truthiness:
                task.out();
                task.enter(boxApply(!task.result!.v ? argv[2]! : argv[1]!, [], loc), loc, env);
        }
    });
    /**
     * C-style inline conditional. Equivalent to a call to `if`.
     * @backolon
     * @category Control Flow
     * @syntax Ternary
     * @pattern cond ? ifTrue : ifFalse
     */
    mod.defsyntax("x ? y : z", 11, true, null, "__rewrite_ternary", rewriteAsApply([symbol_x, symbol_y, symbol_z], "if"));
}
