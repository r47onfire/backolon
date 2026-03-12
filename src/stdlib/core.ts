import { define_builtin_function, define_pattern } from ".";
import { mapGetKey } from "../objects/map";
import { boxApply, boxNameSymbol, boxNil, boxRoundBlock, Thing, ThingType, typecheck } from "../objects/thing";
import { unparse } from "../parser/unparse";
import { removed_whitespace } from "../patterns/meta";
import { NativeFunctionDetails } from "../runtime/scheduler";

const x = boxNameSymbol("x"), y = boxNameSymbol("y");

export function initCoreSyntax(env: Thing<ThingType.env>, functions: Record<string, NativeFunctionDetails>) {
    define_pattern(env, functions, "[^]x... {\n|;} {y...|}[$]", [ThingType.roundblock, ThingType.topblock], "__builtin_rewrite_sequence", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        var first = mapGetKey(groups, x)!;
        var second = mapGetKey(groups, y);
        first = boxRoundBlock(first.c!, first.loc);
        if (second) {
            second = boxRoundBlock(second.c!, second.loc);
            task.out(boxApply(boxNameSymbol("__builtin_sequence", first.loc), second ? [first, second] : [first], first.loc));
        } else {
            // effectively just strip the trailing line terminator
            task.out(first);
        }
    });
    define_builtin_function(env, functions, "__builtin_sequence", "@_ @_", (task, state) => {
        const first = state.argv[0]!;
        const second = state.argv[1]!;
        task.updateCookie(1, 0);
        if (state.index === 0) {
            task.enter(boxApply(first, [], first.loc), state.env);
        } else if (second) {
            task.out();
            task.enter(boxApply(second, [], second.loc), state.env);
        }
    });
    define_pattern(env, functions, "[^]x y...[$]", [ThingType.roundblock, ThingType.topblock], "__builtin_apply", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const fun = mapGetKey(groups, x)!;
        const args = removed_whitespace(mapGetKey(groups, y)!.c);
        task.out(boxApply(fun, args, fun.loc));
    });
    define_builtin_function(env, functions, "print", "_", (task, state) => {
        console.log(state.argv.map(arg => typecheck(ThingType.string)(arg) ? arg.v : unparse(arg)).join(" "));
        task.out(boxNil());
    });
}
