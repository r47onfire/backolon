import { RuntimeError } from "../errors";
import { newEmptyMap } from "../objects/map";
import { boxApply, boxBoolean, boxErrorValue, boxList, Thing, ThingType, typecheck } from "../objects/thing";
import { StackFlag } from "../runtime/task";
import { NativeModule } from "./module";

/**
 * @file Error handling primitives for Backolon
 * @module Builtins
 */

export function error_handling(mod: NativeModule) {
    /**
     * Create and throw a catchable error with the given type and message.
     * @backolon
     * @category Error Handling
     * @function error
     * @param {name} type - error type/category name
     * @param {string} message - error message
     * @param {map<name, continuation>} restarts - map of available restart options
     * @returns {error}
     * @example
     * ```backolon
     * error `type_error "expected a number"
     * ```
     */
    mod.defun("error", "type:name message:string restarts:[map nil]=nil", (task, state) => {
        const type = state.argv[0] as Thing<ThingType.name>;
        const msg = state.argv[1] as Thing<ThingType.string>;
        const restarts = state.argv[2] as Thing<ThingType.map> | Thing<ThingType.nil>;
        const restarts_map = typecheck(ThingType.nil)(restarts) ? newEmptyMap(state.loc) : restarts;
        for (var pair of restarts_map.c) {
            // TODO: make this a resumable error
            if (!typecheck(ThingType.name)(pair.c[0])) {
                throw new RuntimeError("restart ID should be a name", pair.c[0].loc);
            }
            if (!typecheck(ThingType.continuation)(pair.c[1])) {
                throw new RuntimeError("restart should be a continuation", pair.c[1].loc);
            }
        }
        const err_value = boxErrorValue(type, msg, restarts_map, boxList([], state.loc), state.loc);
        task.failed = true;
        task.out(err_value);
    });

    /**
     * Unified resource management construct: ensures enter() is called, then body is evaluated,
     * then exit() is called with nil if body succeeded or an error if body failed.
     * Even if an error occurs, exit() is guaranteed to run before the error propagates.
     * This combines Scheme's dynamic-wind semantics with error-aware cleanup.
     * If exit() returns a truthy value when it's called with an error, the error will not propagate.
     * @backolon
     * @category Error Handling
     * @function with
     * @param {func<[isContinuation: boolean], any>} enter - function to run on entering the block
     * @param {func<[isContinuation: boolean, caughtError: error | nil], boolean>} exit - function to run on exiting the block - return true to suppress error propagation
     * @param {block} body - expression to evaluate
     * @example
     * ```backolon
     * with ([k] => print "entering") ([k err] => print "exiting" err) (
     *     print "body"
     *     42
     * )
     * # prints "entering" "body" "exiting nil" and returns 42
     * ```
     */
    mod.defun("with", "enter:[func nil] exit:[func nil] @body", (task, state) => {
        const { loc, env, argv } = state;
        const enter_fn = argv[0]!;
        const body_fn = argv[1]!;
        const exit_fn = argv[2]!;

        /* We basically need to encode a microcode program via stack frames here:

        enter(false)
        try:
            body()
        except Exception as e:
            if not exit(false, e): raise
        else:
            exit(nil)

        with the semantics that enter() and exit() are also invoked on continuations jumping in or out too, but with true.

        */
        throw "Not implemented";
    });
}
