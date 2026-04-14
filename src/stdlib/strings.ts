import { stringify } from "lib0/json";
import { mapGetKey } from "../objects/map";
import { boxApply, boxNativeFunc, boxNumber, boxOperatorSymbol, boxRoundBlock, boxString, isBlock, Thing, ThingType, typecheck } from "../objects/thing";
import { DEFAULT_UNPARSER } from "../parser/unparse";
import { BUILTINS_LOC } from "./locations";
import { NativeModule, symbol_x } from "./module";

/**
 * @file
 * @module Builtins
 */

export function strings(mod: NativeModule) {
    /**
     * @backolon
     * @category Strings
     * @syntax Concatenate Strings
     * @pattern string + string
     * @example
     * ```backolon
     * "hello, " + "world!" # => "hello, world!"
     * ```
     */
    mod.defoverload("add", [ThingType.string, ThingType.string], (loc, argv) => {
        const x = argv[0].v + argv[1].v;
        return boxString(x, loc, stringify(x), "");
    });
    const BUILTIN_TOSTRING = boxNativeFunc("__tostring", BUILTINS_LOC);
    mod.defsyntax("[x:stringblock]", -Infinity, false, null, "__rewrite_stringblock", (task, state) => {
        const map = state.argv[0]! as Thing<ThingType.map>;
        const x = mapGetKey(map, symbol_x)!;
        const contents: Thing[] = [];
        for (var item of x.c) {
            if (contents.length > 0) {
                contents.push(boxOperatorSymbol("+", item.loc));
            }
            if (isBlock(item)) {
                item = boxApply(BUILTIN_TOSTRING, [item], item.loc);
            }
            contents.push(item);
        }
        task.out(boxRoundBlock(contents, x.loc));
    });
    mod.defun("__tostring", "value", (task, state) => {
        const value = state.argv[0]!;
        const string = typecheck(ThingType.string)(value) ? value.v : DEFAULT_UNPARSER.unparse(value);
        task.out(boxString(string, value.loc, stringify(string), ""));
    });
    mod.defoverload("length", [ThingType.string], (loc, argv) => boxNumber(argv[0].v.length, loc));
}
