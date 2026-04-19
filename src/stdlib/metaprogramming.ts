import { stringify } from "lib0/json.js";
import { BackolonError, RuntimeError } from "../errors";
import { boxApply, boxBlock, boxList, boxNativeFunc, boxOperatorSymbol, boxRoundBlock, boxString, CheckedType, isAtom, isBlock, Thing, ThingType, typecheck } from "../objects/thing";
import { newEnv } from "../runtime/env";
import { BUILTINS_LOC } from "./locations";
import { NativeModule, rewriteAsApply, sortPatternsList, symbol_x } from "./module";

/**
 * @file
 * @module Builtins
 */

export function metaprogramming(mod: NativeModule) {
    const x = [symbol_x];
    /**
     * Quote a value without evaluating it
     * @backolon
     * @category Metaprogramming
     * @syntax Quote
     * @pattern \`expression
     * @example
     * ```backolon
     * `(thisvariabledoesnotexist + 1) # won't error
     * ```
     */
    mod.defsyntax("` x", 0, true, null, "__rewrite_quote", rewriteAsApply(x, "__quote"));
    mod.defun("__quote", "@value", (task, state) => {
        const item = state.argv[0] as Thing<ThingType.implicitfunc>;
        task.out(item.c[0]);
    });
    mod.defun("__eval", "value env:[map nil]=nil patterns:[list nil]=nil inherit=true", (task, state) => {
        const valueToEval = state.argv[0]!;
        const envArg = state.argv[1]! as Thing<ThingType.map> | Thing<ThingType.nil>;
        const patternsArg = state.argv[2]! as Thing<ThingType.list> | Thing<ThingType.nil>;
        const inherit = !!state.argv[3]!.v;
        const envIsNil = typecheck(ThingType.nil)(envArg);
        const patternsIsNil = typecheck(ThingType.nil)(patternsArg);
        const patternsList: Thing<ThingType.pattern_entry>[] = patternsArg.c.slice() as any[];
        if (!patternsIsNil) for (var item of patternsList) {
            if (!typecheck(ThingType.pattern_entry)(item)) {
                throw new RuntimeError("Invalid pattern", (item as any).loc);
            }
            sortPatternsList(patternsList);
        }
        const env = patternsIsNil && envIsNil ? state.env : newEnv(envIsNil ? state.env.c[1]! : envArg, patternsIsNil ? state.env.c[2]! : boxList(patternsList, patternsArg.loc), envArg.loc, inherit ? state.env.c[0]!.c as any[] : []);
        task.out();
        task.enter(valueToEval, valueToEval.loc, env);
    });
    /**
     * Quasiquoting of values. Works exactly like Scheme's quasiquote and unquote.
     * Currently there is no unquote-splicing.
     * @backolon
     * @syntax Quasiquote Templating
     * @pattern "{value value $interpolated {innerValue $$alsoInterpolated $notInterpolated}}"
     */
    mod.defsyntax("[x:curlyblock]", -Infinity, false, null, "__rewrite_curlyblock", rewriteAsApply(x, "__quasiquoted"));
    mod.defun("__quasiquoted", "@template:curlyblock", (task, state) => {
        task.out();
        task.enter(build_quasiquoted(state.argv[0] as any), state.loc, state.env);
    });
    mod.defoverload("add", [ThingType.roundblock, ThingType.roundblock], (loc, argv) => {
        return boxRoundBlock([...argv[0].c, ...argv[1].c], loc);
    });
    mod.defun("__block_wrap", "item", (task, state) => {
        task.out(boxRoundBlock([state.argv[0]!], state.value.loc));
    });
    mod.defun("__change_block_type", "type:string block:roundblock", (task, state) => {
        const type = ThingType[state.argv[0]!.v as any] as unknown as CheckedType<typeof isBlock>;
        const { c, loc } = state.argv[1]!;
        const { s0, s1 } = {
            [ThingType.roundblock]: { s0: "(", s1: ")" },
            [ThingType.curlyblock]: { s0: "{", s1: "}" },
            [ThingType.squareblock]: { s0: "[", s1: "]" },
            [ThingType.topblock]: { s0: "", s1: "" },
            [ThingType.stringblock]: { s0: "\"", s1: "\"" },
        }[type];
        task.out(boxBlock(c, type, loc, s0, s1));
    });
    // /**
    //  * 
    //  */
    // mod.defun("splat", "value:[list roundblock]", )
}

const BUILTIN_CHANGE_BLOCK_TYPE = boxNativeFunc("__change_block_type", BUILTINS_LOC);
export const BUILTIN_QUOTE = boxNativeFunc("__quote", BUILTINS_LOC);
const BUILTIN_BLOCK_WRAP = boxNativeFunc("__block_wrap", BUILTINS_LOC);
function build_quasiquoted(value: Thing, level = 1): Thing {
    if (isAtom(value)) return quote(value);
    const items = value.c;
    const output: Thing[] = [];
    // console.log("{");
    // console.log(items.map(x => DEFAULT_UNPARSER.unparse(x)));
    var unquoteCount = 0;
    var firstUnquotePosition = -1;
    try {
        for (var item of items) {
            var isQuote = false, shouldQuote = true;
            if (typecheck(ThingType.operator)(item) && item.v === "$") {
                if (unquoteCount === 0) firstUnquotePosition = output.length;
                unquoteCount++;
                isQuote = true;
            }
            else if (typecheck(ThingType.space, ThingType.newline)(item)) {
                isQuote = true;
            }
            else if (isBlock(item)) {
                const topwrap = build_quasiquoted(item, level + +(item.t === ThingType.curlyblock));
                shouldQuote = false;
                const typeStr = ThingType[item.t];
                item = boxApply(BUILTIN_CHANGE_BLOCK_TYPE, [boxString(typeStr, item.loc, stringify(typeStr), ""), topwrap], item.loc);
            }
            // Handle unquoted
            if (!isQuote) {
                if (unquoteCount > level) {
                    throw new RuntimeError(`too many unquotes (there are ${unquoteCount} unquotes, but we're only at level ${level})`, output[firstUnquotePosition]!.loc);
                }
                else if (unquoteCount === level) {
                    output.splice(firstUnquotePosition, Infinity);
                }
                else if (shouldQuote) {
                    item = quote(item);
                }
                unquoteCount = 0;
            } else {
                item = quote(item);
            }
            item = nested(item);
            if (output.length > 0) {
                output.push(boxOperatorSymbol("+", item.loc));
            }
            output.push(item);
        }
        if (unquoteCount > 0) {
            throw new RuntimeError("stray quotes at end", output[firstUnquotePosition]!.loc);
        }
        const result = boxRoundBlock(output, value.loc);
        // console.log("} OUT", JSON.stringify(output.map(e => DEFAULT_UNPARSER.unparse(e)), null, 4));
        // throw 1;
        return result;
    } catch (e) {
        if (e instanceof BackolonError) {
            e.addNote(`note: level ${level} starts here:`, value.loc);
        }
        throw e;
    }
}

function quote(value: Thing) {
    return boxApply(BUILTIN_QUOTE, [value], value.loc);
}
function nested(value: Thing, loc = value.loc) {
    return boxApply(BUILTIN_BLOCK_WRAP, [value], value.loc);
}
