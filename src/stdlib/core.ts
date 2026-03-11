import { define_builtin_function, define_pattern } from ".";
import { mapGetKey } from "../objects/map";
import { boxNameSymbol, boxNil, boxRoundBlock, Thing, ThingType, typecheck } from "../objects/thing";
import { unparse } from "../parser/unparse";
import { removed_whitespace } from "../patterns/meta";
import { NativeFunctionDetails } from "../runtime/scheduler";

const x = boxNameSymbol("x"), y = boxNameSymbol("y");

export function initCoreSyntax(env: Thing<ThingType.env>, functions: Record<string, NativeFunctionDetails>) {
    define_pattern(env, functions, "[^]x... {\n|;} {y...|}[$]", [ThingType.roundblock, ThingType.topblock], "__builtin_sequence", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const first = mapGetKey(groups, x)!;
        const second = mapGetKey(groups, y);
        task.updateCookie(1, 0);
        if (state.index === 0) {
            task.enter(boxRoundBlock(first.c as any, first.loc), state.env);
        } else if (second) {
            task.enter(boxRoundBlock(second.c as any, second.loc), state.env);
        } else {
            task.out();
        }
    });
    define_pattern(env, functions, "[^]x y...[$]", [ThingType.roundblock, ThingType.topblock], "__builtin_apply", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const fun = mapGetKey(groups, x)!;
        const args = removed_whitespace(mapGetKey(groups, y)!.c);
        task.out();
        task.enter(new Thing(ThingType.apply, [fun, ...args], null, "", "", " ", fun.loc), state.env);
    });
    define_builtin_function(env, functions, "print", "_", (task, state) => {
        console.log(state.argv.map(arg => typecheck(ThingType.string)(arg) ? arg.v : unparse(arg)).join(" "));
        task.out(boxNil());
        // console.log(Bun.inspect(task.stack, { depth: 5 }));
        // throw 1;
    });
}
