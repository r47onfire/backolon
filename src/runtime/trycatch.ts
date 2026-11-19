import type { LinkedList } from "@r47onfire/game-math";
import type { BaseBackolonError, StackTreeNode } from "../errors";
import type { Builtin } from "../obj/builtin_function";
import type { BLOCK_SIG } from "./block";
import { callValue } from "./call";
import type { Env } from "./env";
import type { Task, TaskGen } from "./vm";

export interface TryCatchHandler {
    /** Used for `instanceof` testing to run the handler. */
    cls: abstract new (...args: unknown[]) => BaseBackolonError;
    handler: Builtin<typeof BLOCK_SIG, unknown>;
}

export function* handleError(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    error: BaseBackolonError,
): TaskGen<any> {
    error.traceback ??= traceback;

    for (let n = handlers; n; n = n.next) {
        const { cls, handler } = n.value;
        if (error instanceof cls) {
            return yield* callValue(
                task,
                env,
                traceback,
                n.next,
                handler,
                undefined,
                [error],
                true,
            );
        }
    }
    throw error;
}
