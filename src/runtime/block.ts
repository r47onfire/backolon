import { CSTNode } from "@r47onfire/nebula";
import { BTypeError } from "../errors";
import { Builtin, Signature } from "../obj";
import { Identifier, objectEntries } from "../utils";
import { Env } from "./env";
import { handleError } from "./trycatch";
export const BLOCK_SIG: Signature<[], "injected", [], never> = {
    byName: { injected: { kind: "normal" } },
    head: [],
    posRest: "injected",
    tail: [],
};

/**
 * Wrap one or more unevaluated forms as a block: a callable that evaluates them
 * in order, in the environment they were written in, and returns the last one's
 * value.
 */
export const makeBlock = (
    forms: CSTNode<any>[],
    closureEnv: Env,
): Builtin<typeof BLOCK_SIG, any> =>
    new Builtin<typeof BLOCK_SIG, any>(function* (
        task,
        _callerEnv,
        traceback,
        handlers,
        injected,
    ) {
        let env = closureEnv;
        if (injected.length > 0) {
            const newscope = new Map<Identifier, any>();
            for (let i = 0; i < injected.length; i++) {
                let item = injected[i];
                for (;;) {
                    if (item instanceof Map) {
                        for (let { 0: key, 1: value } of item.entries())
                            newscope.set(key, value);
                        break;
                    } else if (typeof item === "object" && item !== null) {
                        const e = objectEntries(
                            item as Record<Identifier, any>,
                        );
                        for (let j = 0; j < e.length; j++)
                            newscope.set(e[j]![0], e[j]![1]);
                        break;
                    } else {
                        item = yield* handleError(
                            task,
                            env,
                            traceback,
                            handlers,
                            new BTypeError("backolon.block.not_a_mapping"),
                        );
                    }
                }
            }
            if (newscope.size > 0) env = new Env([env], newscope);
        }
        let result: any = null;
        for (const form of forms) {
            result = yield* task.eval(form, env, traceback, handlers, []);
        }
        return result;
    }, BLOCK_SIG);
