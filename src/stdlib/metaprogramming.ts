import { last } from "lib0/array";
import { NativeModule, rewriteAsApply, sort_patterns_list, symbol_x } from ".";
import { RuntimeError } from "../errors";
import { boxApply, boxCurlyBlock, boxList, boxNativeFunc, boxOperatorSymbol, boxRoundBlock, Thing, ThingType, typecheck } from "../objects/thing";
import { unparse } from "../parser/unparse";
import { matchPattern } from "../patterns/match";
import { nonoverlappingmatches, p, removed_whitespace } from "../patterns/meta";
import { newEnv } from "../runtime/env";
import { id } from "lib0/function";

export function metaprogramming(mod: NativeModule) {
    const x = [symbol_x];
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
        var patternsList: Thing<ThingType.pattern_entry>[] = patternsArg.c.slice() as any[];
        if (!patternsIsNil) for (var item of patternsList) {
            if (!typecheck(ThingType.pattern_entry)(item)) {
                throw new RuntimeError("Invalid pattern", (item as any).loc);
            }
            sort_patterns_list(patternsList);
        }
        const env = patternsIsNil && envIsNil ? state.env : newEnv(envIsNil ? state.env.c[1]! : envArg, patternsIsNil ? state.env.c[2]! : boxList(patternsList, patternsArg.loc), envArg.loc, inherit ? state.env.c[0]!.c as any[] : []);
        task.out();
        task.enter(valueToEval, env);
    });
    mod.defsyntax("[x:curlyblock]", -Infinity, false, null, "__rewrite_curlyblock", rewriteAsApply(x, "__quasiquoted"));
    mod.defun("__quasiquoted", "@template:curlyblock", (task, state) => {
        task.out();
        task.enter(build_quasiquoted(state.argv[0] as any, 1), state.env);
    });
    mod.defoverload("add", [ThingType.roundblock, ThingType.roundblock], (loc, argv) => {
        return boxRoundBlock([...argv[0].c, ...argv[1].c], loc);
    });
    mod.defun("__block_wrap", "x", (task, state) => task.out(boxRoundBlock([state.argv[0]!], state.value.loc)));
}

function build_quasiquoted(value: Thing<ThingType.curlyblock>, level: number): Thing {
    const items = value.c;
    const matches = nonoverlappingmatches(matchPattern(items, interpolation_pattern, true));
    var previous = 0;
    const output: Thing[] = [];
    console.log("{");
    const add = (item: Thing[], allowPlus = true) => {
        if (level < 2 && output.length > 0 && allowPlus) {
            output.push(boxOperatorSymbol("+", item[0]!.loc));
        }
        output.push(...item);
    };
    const handleSlice = (slice: readonly Thing[]) => {
        const q = level > 1 ? ((x: any) => [x]) : quote;
        for (; slice.length > 0;) {
            const lastIndex = slice.findIndex(typecheck(ThingType.curlyblock));
            if (lastIndex > 0) {
                add(q(boxRoundBlock(slice.slice(0, lastIndex), slice[0]!.loc)));
                add([build_quasiquoted(slice[lastIndex] as Thing<ThingType.curlyblock>, level + 1)]);
                slice = slice.slice(lastIndex + 1);
            } else {
                add(q(boxRoundBlock(slice, slice[0]!.loc)));
                break;
            }
        }
    };
    const handleUnquote = (slice: readonly Thing[]) => {
        const unquoteLevels = slice.length - 1;
        const itemUnquoted = last(slice);
        if (unquoteLevels < level) {
            add(slice.slice(0, -1));
            add([itemUnquoted], false);
        } else if (unquoteLevels === level) {
            const loc = itemUnquoted.loc;
            add([boxApply(boxNativeFunc("__block_wrap", loc), [boxRoundBlock([itemUnquoted], loc)], loc)]);
        } else {
            const badUnquote = slice[level]!;
            throw new RuntimeError(`too many unquotes (there are ${unquoteLevels} unquotes here, but we're only ${level} levels deep)`, badUnquote.loc);
        }
    };
    for (var { span } of matches) {
        handleSlice(items.slice(previous, span[0]));
        handleUnquote(removed_whitespace(items.slice(span[0], span[1])));
        previous = span[1];
    }
    handleSlice(items.slice(previous));
    console.log("} OUT", level, output.map(x => unparse(x)));
    return level > 1 ? quote(boxCurlyBlock(output, value.loc))[0] : boxRoundBlock(output, value.loc);
}

function quote(value: Thing): [Thing] {
    return [boxRoundBlock([boxOperatorSymbol("`", value.loc), value], value.loc)];
}

const interpolation_pattern = p("($ )...[+]x");
