import { NativeModule, rewriteAsApply, symbol_x } from ".";
import { RuntimeError } from "../errors";
import { boxList, boxNativeFunc, Thing, ThingType, typecheck } from "../objects/thing";
import { newEnv } from "../runtime/env";

export function metaprogramming(mod: NativeModule) {
    mod.defsyntax("` x", 0, true, null, "__rewrite_quote", rewriteAsApply([symbol_x], "__builtin_quote"));
    mod.defun("__builtin_quote", "@value", (task, state) => {
        const item = state.argv[0] as Thing<ThingType.implicitfunc>;
        task.out(item.c[0]);
    });
    mod.defun("__builtin_eval", "value env:[map nil]=nil patterns:[list nil]=nil inherit=true", (task, state) => {
        const valueToEval = state.argv[0]!;
        const envArg = state.argv[1]! as Thing<ThingType.map> | Thing<ThingType.nil>;
        const patternsArg = state.argv[2]! as Thing<ThingType.list> | Thing<ThingType.nil>;
        const inherit = !!state.argv[3]!.v;
        const envIsNil = typecheck(ThingType.nil)(envArg);
        const patternsIsNil = typecheck(ThingType.nil)(patternsArg);
        if (!patternsIsNil) for (var item of patternsArg.c) {
            if (!typecheck(ThingType.pattern_entry)(item)) {
                throw new RuntimeError("Invalid pattern", item.loc);
            }
        }
        const env = patternsIsNil && envIsNil ? state.env : newEnv(envIsNil ? state.env.c[1]! : envArg, patternsIsNil ? state.env.c[2]! : patternsArg, envArg.loc, inherit ? state.env.c[0]!.c as any[] : []);
        task.out();
        task.enter(valueToEval, env);
    });
    mod.defsyntax("[x:curlyblock]", -Infinity, false, null, "__rewrite_curlyblock", rewriteAsApply([symbol_x], "__builtin_template"));
}
