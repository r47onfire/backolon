import { boxApply, boxBoolean, boxNativeFunc } from "../objects/thing";
import { StackFrame, Task } from "../runtime/task";
import { BUILTINS_LOC } from "./locations";
import { NativeModule, rewriteAsApply, symbol_x, symbol_y } from "./module";

/**
 * @file
 * @module Builtins
 */

export const BUILTIN_TO_BOOLEAN = boxNativeFunc("__bool", BUILTINS_LOC);

export enum BooleanState {
    initial,
    got_first_truthiness,
}

export function logic(mod: NativeModule) {

    mod.defop("__bool", "bool");
    mod.defoverload("bool", [null], (loc, argv) => boxBoolean(!!(argv[0]!.v ?? argv[0]!.c.length), loc));

    // /**
    //  * @syntax Equality
    //  * @backolon
    //  * @category Comparison
    //  * @pattern value == value
    //  */
    // mod.defsyntax("x == y", 7, false, null, "__rewrite_eq", rewriteAsApply([symbol_x, symbol_y], "__eq"));
    // mod.defun("__eq", "x y", equality_helper(false));
    // /**
    //  * @syntax Inequality
    //  * @backolon
    //  * @category Comparison
    //  * @pattern value != value
    //  */
    // mod.defsyntax("x != y", 7, false, null, "__rewrite_not_eq", rewriteAsApply([symbol_x, symbol_y], "__not_eq"));
    // mod.defun("__not_eq", "x y", equality_helper(true));


    const bool_helper = (short_circuit_if: boolean) => (task: Task, state: StackFrame) => {
        const { argv, loc, env, data, cookie } = state;
        switch (cookie as BooleanState) {
            case BooleanState.initial:
                task.updateCookie(0, BooleanState.got_first_truthiness, argv[0]);
                task.enter(boxApply(BUILTIN_TO_BOOLEAN, [argv[0]!], loc), loc, env);
                return;
            case BooleanState.got_first_truthiness:
                console.log("got first truthiness", task.result, "will short circuit if", short_circuit_if);
                if (!!task.result!.v === short_circuit_if) {
                    task.out(data);
                } else {
                    task.out();
                    task.enter(boxApply(argv[1]!, [], loc), loc, env);
                }
        }

    };

    // operation("not");
    // /**
    //  * @syntax Logical NOT
    //  * @backolon
    //  * @category Logic
    //  * @pattern (!any)
    //  */
    // unary("not", "!", 0, true, x => x ? 0 : 1);

    /**
     * @syntax Equality
     * @backolon
     * @category Comparison
     * @pattern value == value
     */
    mod.defsyntax("x && y", 5, false, null, "__rewrite_and", rewriteAsApply([symbol_x, symbol_y], "__and"));
    mod.defun("__and", "x @y", bool_helper(false));
    /**
     * @syntax Inequality
     * @backolon
     * @category Comparison
     * @pattern value != value
     */
    mod.defsyntax("x || y", 5, false, null, "__rewrite_or", rewriteAsApply([symbol_x, symbol_y], "__or"));
    mod.defun("__or", "x @y", bool_helper(true));
}
