import { NativeModule } from "./module";
import { boxApply } from "../objects/thing";

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
    mod.defun("if", "cond @true @false=nil", (task, state) => {
        const condition = state.argv[0]!;
        const ifTrue = state.argv[1]!;
        const ifFalse = state.argv[2]!;
        task.out();
        task.enter(boxApply(!!condition.v ? ifTrue : ifFalse, [], condition.loc), condition.loc, state.env);
    });
}
