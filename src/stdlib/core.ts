import { last } from "lib0/array";
import { stringify } from "lib0/json";
import { NativeModule, rewriteAsApply, symbol_x, symbol_y } from ".";
import { ErrorNote, LocationTrace, RuntimeError } from "../errors";
import { mapGetKey, mapUpdateKeyMutating } from "../objects/map";
import { boxApply, boxNativeFunc, boxNil, boxNumber, boxRoundBlock, boxSquareBlock, Thing, ThingType, typecheck, typeNameOf } from "../objects/thing";
import { unparse } from "../parser/unparse";
import { removed_whitespace } from "../patterns/meta";
import { walkEnvTree } from "../runtime/env";
import { parseSignature } from "../runtime/functor";
import type { StackEntry, Task } from "../runtime/task";
import { control_flow } from "./control_flow";
import { math } from "./math";

export function initCoreSyntax(mod: NativeModule) {
    mod.defvar("nil", boxNil(mod.loc));
    mod.defvar("false", boxNumber(0, mod.loc, "false"));
    mod.defvar("true", boxNumber(1, mod.loc, "true"));
    const xy = [symbol_x, symbol_y];
    // MARK: blocks and logical lines
    const EXPLICIT_BLOCK_PRECEDENCE = -Infinity;
    const LAMBDA_PRECEDENCE = -1e100;
    const VARIABLE_ASSIGNMENT_PRECEDENCE = 0;
    const IMPLICIT_BLOCK_PRECEDENCE = 1e100;
    const APPLY_PRECEDENCE = Infinity;
    mod.defsyntax("[^] {x...|}  ;  [y{_| }...] [$]", EXPLICIT_BLOCK_PRECEDENCE, false, null, "__rewrite_sequence", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        var first = mapGetKey(groups, symbol_x);
        var second = mapGetKey(groups, symbol_y);
        if (first) {
            first = boxRoundBlock(first.c, first.loc);
            if (second && second.c.length > 0) {
                second = boxRoundBlock(second.c, second.loc);
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
    mod.defsyntax("[^] {x...|}  (\n)  [y{_| }...] [$]", IMPLICIT_BLOCK_PRECEDENCE, false, null, "__rewrite_sequence");
    mod.defun("__sequence", "@first @rest", (task, state) => {
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
    mod.defsyntax("[^] x ! [$]", APPLY_PRECEDENCE, false, null, "__rewrite_apply", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const fun = mapGetKey(groups, symbol_x)!;
        const argv = mapGetKey(groups, symbol_y);
        const args = argv ? removed_whitespace(argv.c) : [];
        const hasArgs = args.length > 0;
        task.out(boxApply(fun, args, fun.loc, hasArgs ? "(" : "", hasArgs ? ")" : "!"));
    });
    // Second one is with arguments
    mod.defsyntax("[^] x  y...[$]", APPLY_PRECEDENCE, false, null, "__rewrite_apply");
    // MARK: variable management
    mod.defsyntax("[=let] x {= y|}", VARIABLE_ASSIGNMENT_PRECEDENCE, false, null, "__rewrite_declaration", rewriteAsApply(xy, "__declare"));
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
    mod.defun("__declare", "@name! value=nil", binding_helper(1, (state, name, value, loc) => {
        const vars = state.env;
        if (mapGetKey(vars.c[1]!, name) !== undefined) {
            throw new RuntimeError(`variable ${stringify(name.v)} already exists in this scope`, loc);
        }
        mapUpdateKeyMutating(vars.c[1]!, name, value);
        if (typecheck(ThingType.func)(value)) {
            value.v ??= name.v;
        }
    }));
    mod.defsyntax("x = y", VARIABLE_ASSIGNMENT_PRECEDENCE, true, null, "__rewrite_assign", rewriteAsApply(xy, "__assign"));
    mod.defun("__assign", "@name! value", binding_helper(2, (state, name, value, loc) => {
        if (!walkEnvTree(state.env, vars => {
            if (mapGetKey(vars, name, loc) !== undefined) {
                mapUpdateKeyMutating(vars, name, value, loc);
                if (typecheck(ThingType.func)(value)) {
                    value.v ??= name.v;
                }
                return true;
            }
            return false;
        })) {
            throw new RuntimeError(`undefined: ${stringify(name.v)}`, loc, [new ErrorNote(`note: add "let" to declare ${stringify(name.v)} to be in this scope`, loc)]);
        };
    }));
    // MARK: lambdas
    mod.defsyntax("[x:squareblock] => y...", LAMBDA_PRECEDENCE, true, null, "__rewrite_lambda", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const name = mapGetKey(groups, symbol_x)!;
        const values = mapGetKey(groups, symbol_y)!.c as any[];
        while (typecheck(ThingType.newline, ThingType.space)(values[0])) values.shift();
        while (typecheck(ThingType.newline, ThingType.space)(last(values))) values.pop();
        const value = boxRoundBlock(values, values[0]!.loc);
        task.out(boxApply(boxNativeFunc("__build_lambda", state.value.loc), [name, value], state.value.loc));
    });
    mod.defun("__build_lambda", "@params! @body", (task, state) => {
        const params = state.argv[0]!;
        if (!typecheck(ThingType.squareblock)(params)) throw new RuntimeError(`wrong object type for lambda signature`, params.loc);
        const signature = boxSquareBlock(parseSignature(params.c), params.loc);
        const body = state.argv[1]!;
        task.out(new Thing(ThingType.func, [signature, body], null, "", "", " => ", params.loc));
    });
    // MARK: builtin function names
    mod.defun("print", "values...", (task, state) => {
        if (!task.scheduler.printHook) {
            throw new Error("Can't use print without a print hook defined");
        }
        task.scheduler.printHook(state.argv.map(arg => typecheck(ThingType.string)(arg) ? arg.v : unparse(arg)).join(" "));
        task.out(boxNil());
    });
    control_flow(mod);
    math(mod);
}
