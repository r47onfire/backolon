import { last } from "lib0/array";
import { stringify } from "lib0/json";
import { define_builtin_function, define_builtin_variable, define_pattern } from ".";
import { ErrorNote, LocationTrace, RuntimeError } from "../errors";
import { mapGetKey, mapUpdateKeyMutating } from "../objects/map";
import { boxApply, boxNameSymbol, boxNativeFunc, boxNil, boxNumber, boxRoundBlock, boxSquareBlock, Thing, ThingType, typecheck, typeNameOf } from "../objects/thing";
import { unparse } from "../parser/unparse";
import { removed_whitespace } from "../patterns/meta";
import { parseSignature } from "../runtime/functor";
import { NativeFunctionDetails } from "../runtime/scheduler";
import type { StackEntry, Task } from "../runtime/task";

const x = boxNameSymbol("x"), y = boxNameSymbol("y");

export function initCoreSyntax(env: Thing<ThingType.env>, functions: Record<string, NativeFunctionDetails>) {
    define_builtin_variable(env, "nil", boxNil());
    define_builtin_variable(env, "false", boxNumber(0, undefined, "false"));
    define_builtin_variable(env, "true", boxNumber(1, undefined, "true"));
    const STANDARD_BLOCKS = [ThingType.roundblock, ThingType.topblock] as any;
    // MARK: blocks and logical lines
    const EXPLICIT_BLOCK_PRECEDENCE = -Infinity;
    const LAMBDA_PRECEDENCE = -1e100;
    const VARIABLE_ASSIGNMENT_PRECEDENCE = 0;
    const IMPLICIT_BLOCK_PRECEDENCE = 1e100;
    const APPLY_PRECEDENCE = Infinity;
    define_pattern(env, functions, "[^]{x...|}  ;  {y...|} [$]", EXPLICIT_BLOCK_PRECEDENCE, false, STANDARD_BLOCKS, "__rewrite_sequence", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        var first = mapGetKey(groups, x);
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
    define_pattern(env, functions, "[^]{x...|}  (\n)  {y...|} [$]", IMPLICIT_BLOCK_PRECEDENCE, false, STANDARD_BLOCKS, "__rewrite_sequence");
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
    // MARK: Apply
    // First one is no arguments
    define_pattern(env, functions, "[^] x ! [$]", APPLY_PRECEDENCE, false, STANDARD_BLOCKS, "__rewrite_apply", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const fun = mapGetKey(groups, x)!;
        const argv = mapGetKey(groups, y);
        const args = argv ? removed_whitespace(argv.c) : [];
        const hasArgs = args.length > 0;
        task.out(boxApply(fun, args, fun.loc, hasArgs ? "(" : "", hasArgs ? ")" : "!"));
    });
    // Second one is with arguments
    define_pattern(env, functions, "[^] x  y...[$]", APPLY_PRECEDENCE, false, STANDARD_BLOCKS, "__rewrite_apply");
    // MARK: variable management
    define_pattern(env, functions, "[=let] x {= y|}", VARIABLE_ASSIGNMENT_PRECEDENCE, false, STANDARD_BLOCKS, "__rewrite_declaration", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const name = mapGetKey(groups, x)!;
        const value = mapGetKey(groups, y);
        task.out(boxApply(boxNativeFunc("__declare", state.value.loc), value ? [name, value] : [name], state.value.loc));
    });
    const binding_helper = (dipAmount: number, cb: (state: StackEntry, name: Thing<ThingType.name>, initialValue: Thing, loc: LocationTrace) => void): ((task: Task, state: StackEntry) => void) => {
        return (task, state) => {
            const name = state.argv[0]!;
            const value = state.argv[1]!;
            const loc = name.loc;
            if (!typecheck(ThingType.name)(name)) {
                throw new RuntimeError(`cannot assign to ${typeNameOf(name.t)}`, loc);
            }
            task.out(value);
            task.dip(dipAmount, state => cb(state, name, value, loc));
        }
    }
    define_builtin_function(env, functions, "__declare", "@name! value=nil", binding_helper(1, (state, name, value, loc) => {
        const vars = state.env;
        if (mapGetKey(vars.c[1]!, name) !== undefined) {
            throw new RuntimeError(`variable ${stringify(name.v)} already exists in this scope`, loc);
        }
        mapUpdateKeyMutating(vars.c[1]!, name, value);
        if (typecheck(ThingType.func)(value)) {
            value.v ??= name.v;
        }
    }));
    define_pattern(env, functions, "x = y", VARIABLE_ASSIGNMENT_PRECEDENCE, true, STANDARD_BLOCKS, "__rewrite_assign", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const name = mapGetKey(groups, x)!;
        const value = mapGetKey(groups, y)!;
        task.out(boxApply(boxNativeFunc("__assign", state.value.loc), [name, value], state.value.loc));
    });
    define_builtin_function(env, functions, "__assign", "@name! value", binding_helper(2, (state, name, value, loc) => {
        for (var env = state.env; env && typecheck(ThingType.env)(env); env = env.c[0]) {
            const vars = env.c[1];
            if (mapGetKey(vars, name, loc) !== undefined) {
                mapUpdateKeyMutating(vars, name, value, loc);
                if (typecheck(ThingType.func)(value)) {
                    value.v ??= name.v;
                }
                return;
            }
        }
        throw new RuntimeError(`undefined: ${stringify(name.v)}`, loc, [new ErrorNote(`note: add "let" to declare ${stringify(name.v)} to be in this scope`, loc)]);
    }));
    // MARK: lambdas
    define_pattern(env, functions, "[x:squareblock] => y...", LAMBDA_PRECEDENCE, true, STANDARD_BLOCKS, "__rewrite_lambda", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const name = mapGetKey(groups, x)!;
        const values = mapGetKey(groups, y)!.c as any[];
        while (typecheck(ThingType.newline, ThingType.space)(values[0])) values.shift();
        while (typecheck(ThingType.newline, ThingType.space)(last(values))) values.pop();
        const value = boxRoundBlock(values, values[0]!.loc);
        task.out(boxApply(boxNativeFunc("__build_lambda", state.value.loc), [name, value], state.value.loc));
    });
    define_builtin_function(env, functions, "__build_lambda", "@params! @body", (task, state) => {
        const params = state.argv[0]!;
        if (!typecheck(ThingType.squareblock)(params)) throw new RuntimeError(`wrong object type for lambda signature`, params.loc);
        const signature = boxSquareBlock(parseSignature(params.c), params.loc);
        const body = state.argv[1]!;
        task.out(new Thing(ThingType.func, [signature, body], null, "", "", " => ", params.loc));
    });
    // MARK: builtin function names
    define_builtin_function(env, functions, "print", "values...", (task, state) => {
        console.log(state.argv.map(arg => typecheck(ThingType.string)(arg) ? arg.v : unparse(arg)).join(" "));
        task.out(boxNil());
    });
}
