import { RuntimeError } from "../errors";
import {
    boxList,
    boxNil,
    boxNumber,
    Thing,
    ThingType,
    typecheck,
} from "../objects/thing";
import { DEFAULT_UNPARSER } from "../parser/unparse";
import { NativeModule } from "./module";

/**
 * @module Builtins
 * @file
 */

export function misc(mod: NativeModule) {
    /**
     * Prints values to whatever is configured as the print hook (usually stdout
     * or similar)
     *
     * @category I/O
     * @example
     *     ```backolon
     *     print "hello" "," " world" "!" # hello, world!
     *     ```;
     *
     * @function print
     * @param {any} values...
     * @returns {nil}
     * @backolon
     */
    mod.defun("print", "values...", (task, state) => {
        if (!task.scheduler.printHook) {
            throw new Error("Can't use print without a print hook defined");
        }
        task.scheduler.printHook(
            state.argv
                .map((arg) =>
                    typecheck(ThingType.string)(arg)
                        ? arg.v
                        : DEFAULT_UNPARSER.unparse(arg),
                )
                .join(" "),
        );
        task.out(boxNil());
    });
    /**
     * Create a list of numbers from `start` to `stop` separated by `step`
     *
     * @example
     *     ```backolon
     *     range 4 # => [0, 1, 2, 3]
     *     range 1 6 # => [1, 2, 3, 4, 5]
     *     range 0 10 2 # => [0, 2, 4, 6, 8]
     *     ```;
     *
     * @function range
     * @param {number} start
     * @param {number} stop
     * @param {number} step
     * @returns {list[number]}
     * @backolon
     */
    mod.defun("range", "arguments:number...", (task, state) => {
        const argv = state.argv;
        var start = 0,
            stop = 0,
            step = 1;
        switch (argv.length) {
            case 1:
                stop = argv[0]!.v;
                break;
            case 2:
                start = argv[0]!.v;
                stop = argv[1]!.v;
                break;
            case 3:
                start = argv[0]!.v;
                stop = argv[1]!.v;
                step = argv[2]!.v;
                break;
            default:
                throw new RuntimeError(
                    `Wrong number of arguments to range (expected 1-3, got ${argv.length})`,
                    (argv[3] ?? state.value).loc,
                );
        }
        if (step == 0) {
            throw new RuntimeError("zero step", argv[2]!.loc);
        }
        if (stop > start && step < 0) {
            throw new RuntimeError(
                "stop > start but step < 0",
                (argv[2] ?? state.value).loc,
            );
        }
        if (start > stop && step > 0) {
            throw new RuntimeError(
                "start > stop but step > 0",
                (argv[0] ?? state.value).loc,
            );
        }
        const start2 = BigInt(start);
        const stop2 = BigInt(stop);
        const step2 = BigInt(step);
        const list: Thing<ThingType.number>[] = [];
        for (var i = start2; step2 > 0n ? i < stop2 : i > stop2; i += step2)
            list.push(boxNumber(i, state.value.loc));
        task.out(boxList(list, state.value.loc));
    });
}
