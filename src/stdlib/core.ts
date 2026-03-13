import { define_builtin_function, define_builtin_variable, define_pattern } from ".";
import { RuntimeError } from "../errors";
import { mapGetKey, mapUpdateKeyMutating } from "../objects/map";
import { boxApply, boxNameSymbol, boxNativeFunc, boxNil, boxNumber, boxRoundBlock, Thing, ThingType, typecheck } from "../objects/thing";
import { unparse } from "../parser/unparse";
import { removed_whitespace } from "../patterns/meta";
import { NativeFunctionDetails } from "../runtime/scheduler";

const x = boxNameSymbol("x"), y = boxNameSymbol("y");

export function initCoreSyntax(env: Thing<ThingType.env>, functions: Record<string, NativeFunctionDetails>) {
    define_builtin_variable(env, "nil", boxNil());
    define_builtin_variable(env, "false", boxNumber(0, undefined, "false"));
    define_builtin_variable(env, "true", boxNumber(1, undefined, "true"));
    const STANDARD_BLOCKS = [ThingType.roundblock, ThingType.topblock] as any;
    // MARK: blocks and logical lines
    define_pattern(env, functions, "[^]{x...|} {\n|;} {y...|}[$]", STANDARD_BLOCKS, "__rewrite_sequence", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        var first = mapGetKey(groups, x)!;
        var second = mapGetKey(groups, y);
        if (first) {
            first = boxRoundBlock(first.c!, first.loc);
            if (second) {
                second = boxRoundBlock(second.c!, second.loc);
                task.out(boxApply(boxNativeFunc("__sequence", first.loc), second ? [first, second] : [first], first.loc));
            } else {
                // effectively just strip the trailing line terminator
                task.out(first);
            }
        } else {
            // we get here if there are a sequence of consecutive newlines or semicolons.
            task.out(boxNil(groups.loc));
        }
    });
    define_builtin_function(env, functions, "__sequence", "@first @rest", (task, state) => {
        const first = state.argv[0]!;
        const second = state.argv[1]!;
        task.updateCookie(1, 0);
        if (state.index === 0) {
            task.enter(boxApply(first, [], first.loc), state.env);
        } else if (second) {
            task.out(); // tail call
            task.enter(boxApply(second, [], second.loc), state.env);
        }
    });
    // MARK: variable management
    define_pattern(env, functions, "[^][=let] [x:name] {= y|}[$]", STANDARD_BLOCKS, "__rewrite_declaration", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const name = mapGetKey(groups, x)!;
        const value = mapGetKey(groups, y);
        task.out(boxApply(boxNativeFunc("__declare", state.value.loc), value ? [name, value] : [name], state.value.loc));
    });
    define_builtin_function(env, functions, "__declare", "@name:name value=nil", (task, state) => {
        const name = state.argv[0]! as Thing<ThingType.name>;
        const initialValue = state.argv[1]!;
        const loc = name.loc;
        task.out(initialValue);
        task.dip(1, state => {
            if (mapGetKey(state.env.c[1]!, name) !== undefined) {
                throw new RuntimeError(`variable ${name.v} already exists in this scope`, loc);
            }
            mapUpdateKeyMutating(state.env.c[1]!, name, initialValue);
        });
    });
    // MARK: Apply
    // This MUST be last otherwise it will override everything else!
    // TODO: need to give patterns a precedence value, and give this one Infinity, so it won't also override user patterns
    define_pattern(env, functions, "[^]x y...[$]", STANDARD_BLOCKS, "__create_apply", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const fun = mapGetKey(groups, x)!;
        const args = removed_whitespace(mapGetKey(groups, y)!.c);
        task.out(boxApply(fun, args, fun.loc));
    });
    // MARK: builtin function names
    define_builtin_function(env, functions, "print", "values...", (task, state) => {
        console.log(state.argv.map(arg => typecheck(ThingType.string)(arg) ? arg.v : unparse(arg)).join(" "));
        task.out(boxNil());
    });
}
