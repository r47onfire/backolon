import { stringify } from "lib0/json";
import { NativeModule, rewriteAsApply, symbol_x, symbol_y, symbol_z } from "./module";
import { RuntimeError } from "../errors";
import { mapGetKey, mapUpdateKeyMutating, newEmptyMap } from "../objects/map";
import { boxApply, boxList, boxNativeFunc, boxNumber, boxOperatorSymbol, boxRoundBlock, boxSquareBlock, boxString, Thing, ThingType } from "../objects/thing";
import { matchPattern } from "../patterns/match";
import { p } from "../patterns/meta";
import { BUILTINS_LOC } from "./locations";
import { BUILTIN_QUOTE } from "./metaprogramming";
import { DEFAULT_UNPARSER } from "../parser/unparse";

/**
 * @file
 * @module Builtins
 */

const BUILTIN_LIST = boxNativeFunc("__list", BUILTINS_LOC);
const BUILTIN_DICT = boxNativeFunc("__dict", BUILTINS_LOC);
const IMPLICIT_KEY = boxNativeFunc("__implicit_key", BUILTINS_LOC);
export function collections(mod: NativeModule) {
    /**
     * List literal
     * @backolon
     * @category Collections
     * @syntax [item1, item2, ...]
     */
    /**
     * Key-value map literal (unordered)
     * @backolon
     * @category Collections
     * @syntax [key: value, key2: value2, ...]
     * @example
     * ```backolon
     * ["name": "Alice", "age": 30]
     * # use the quote operator to use a symbol as the key
     * [`name: "Alice", `age: 30]
     * # Shorthand for symbol key and value being that variable:
     * variable := 10
     * [`variable:] # => [`variable: 10]
     * ```
     */
    mod.defsyntax("[x:squareblock]", -1e50, false, null, "__rewrite_squareblock", (task, state) => {
        const arg = state.argv[0]! as Thing<ThingType.map>;
        const loc = arg.loc;
        const block = mapGetKey(arg, symbol_x)!;
        if (matchPattern(block.c, empty_list_pattern, false).length > 0) {
            task.out(boxApply(BUILTIN_LIST, [], loc));
            return;
        }
        if (matchPattern(block.c, empty_map_pattern, false).length > 0) {
            task.out(boxApply(BUILTIN_DICT, [], loc));
            return;
        }
        const split = matchPattern(block.c, split_on_comma, false)[0];
        if (!split) {
            throw new RuntimeError("Unknown error parsing collection literal", loc);
        }
        const first = split.bindings[0]![1] as any[];
        const rest = split.bindings[1]?.[1] as any[] | undefined;
        const split2 = matchPattern(first, split_on_colon, false)[0];
        var first_el;
        if (split2) {
            const key = split2.bindings[0]![1] as any[];
            const keyB = boxRoundBlock(key, key[0]!.loc);
            const value = split2.bindings[1]![1] as any[];
            const valueB = boxRoundBlock(value, value[0]!.loc);
            first_el = boxApply(BUILTIN_DICT, [keyB, valueB], valueB.loc);
        } else {
            const split3 = matchPattern(first as any[], implicit_key, false)[0];
            if (split3) {
                const first = split3.bindings[0]![1] as any[];
                const firstB = boxRoundBlock(first, first[0].loc);
                first_el = boxApply(IMPLICIT_KEY, [firstB], first[0].loc);
            } else {
                const firstB = boxRoundBlock(first, (first)[0].loc);
                first_el = boxApply(BUILTIN_LIST, [firstB], firstB.loc);
            }
        }
        if (rest) {
            const loc = rest[0].loc;
            const restB = boxRoundBlock([boxSquareBlock(rest, loc)], loc);
            task.out(boxRoundBlock([first_el, boxOperatorSymbol("+", first_el.loc), restB], restB.loc));
        } else {
            task.out(first_el);
        }
    });
    mod.defun("__list", "items...", (task, state) => {
        task.out(boxList(state.argv.slice(), state.value.loc));
    });
    mod.defun("__dict", "items...", (task, state) => {
        const loc = state.value.loc;
        const m = newEmptyMap(loc);
        const argv = state.argv;
        const len = argv.length;
        if ((len & 1) !== 0) throw new RuntimeError("odd number of arguments", loc);
        for (var i = 0; i < len; i += 2) {
            const key = argv[i]!;
            const value = argv[i + 1]!;
            mapUpdateKeyMutating(m, key, value, key.loc);
        }
        task.out(m);
    });
    mod.defun("__implicit_key", "kv", (task, state) => {
        const val = state.argv[0]!;
        task.out();
        task.enter(boxApply(BUILTIN_DICT, [boxApply(BUILTIN_QUOTE, [val], val.loc), val], val.loc), val.loc, state.env);
    });
    /**
     * Concatenate lists
     * @backolon
     * @category Collections
     * @syntax list1 + list2
     * @example
     * ```backolon
     * [1, 2] + [3, 4] # => [1, 2, 3, 4]
     * ```
     */
    mod.defoverload("add", [ThingType.list, ThingType.list], (loc, argv) => {
        return boxList([...argv[0].c, ...argv[1].c], loc);
    });
    /**
     * Merge maps (2nd map's keys take priority)
     * @backolon
     * @category Collections
     * @syntax map1 + map2
     * @example
     * ```backolon
     * [1: 2, 2: 4] + [1: 3, 4: 5] # => [1: 3, 2: 4, 4: 5]
     * ```
     */
    mod.defoverload("add", [ThingType.map, ThingType.map], (loc, argv) => {
        const head = argv[0], tail = argv[1];
        const m2 = newEmptyMap(head.loc);
        for (var i = 0; i < head.c.length; i++) {
            mapUpdateKeyMutating(m2, head.c[i]!.c[0], head.c[i]!.c[1], loc);
        }
        for (i = 0; i < tail.c.length; i++) {
            mapUpdateKeyMutating(m2, tail.c[i]!.c[0]!, tail.c[i]!.c[1]!, loc);
        }
        return m2;
    });
    /**
     * Access list indexes or map keys
     * @backolon
     * @category Collections
     * @syntax map -> any
     * @syntax list -> number
     * @example
     * ```backolon
     * [1, 2, 3]->1 # => 2
     * ```
     */
    mod.defop("__getitem", "getitem");
    mod.defoverload("getitem", [ThingType.list, ThingType.number], (loc, argv) => {
        const list = argv[0].c;
        const index = Number(argv[1].v);
        const value = list.at(index);
        if (value === undefined) {
            throw new RuntimeError(`list index ${index} out of range for length ${list.length}`, loc);
        }
        return value;
    });
    mod.defoverload("getitem", [ThingType.map, null], (loc, argv) => {
        const map = argv[0];
        const key = argv[1];
        const value = mapGetKey(map, key, loc);
        if (value === undefined) {
            throw new RuntimeError(`key ${DEFAULT_UNPARSER.unparse(key)} not found in map`, loc);
        }
        return value;
    });
    mod.defsyntax("x -> y", -1, false, null, "__rewrite_getitem", rewriteAsApply([symbol_x, symbol_y], "__getitem"));
    // Syntax sugar: x.y expands to x->"y"
    mod.defsyntax("x . [y:name]", -1, false, null, "__rewrite_dot_getitem", (task, state) => {
        const groups: Thing<ThingType.map> = state.argv[0]! as any;
        const x = mapGetKey(groups, symbol_x)!;
        const y = mapGetKey(groups, symbol_y)!;
        // Create the expression: x -> "y"
        const arrowExpr = new Thing(ThingType.splat, [
            x,
            boxOperatorSymbol("-", x.loc),
            boxOperatorSymbol(">", x.loc),
            boxString(y.v, y.loc, stringify(y.v), ""),
        ], null, "", "", "", state.value.loc);
        task.out(arrowExpr);
    });
    mod.defop("__setitem", "setitem");
    mod.defoverload("setitem", [ThingType.list, ThingType.number, null], (loc, argv) => {
        const list = argv[0];
        const index = argv[1];
        const value = argv[2];
        list.c.splice(Number(index.v), 1, value);
        return value;
    });
    mod.defoverload("setitem", [ThingType.map, null, null], (loc, argv) => {
        const map = argv[0];
        const key = argv[1];
        const value = argv[2];
        mapUpdateKeyMutating(map, key, value, loc);
        return value;
    });
    // TODO: this breaks for w->x=y->z it parses as (w->x=y)->z
    mod.defsyntax("x -> y = z", -2, true, null, "__rewrite_setitem", rewriteAsApply([symbol_x, symbol_y, symbol_z], "__setitem"));
    /**
     * Length of string, list, or map
     * @backolon
     * @category Collections
     * @syntax #collection
     * @example
     * ```backolon
     * #"hello" # => 5
     * #[1, 2, 3] # => 3
     * #[1: 2] # => 1
     * ```
     */
    mod.defop("__length", "length");
    mod.defoverload("length", [ThingType.list], (loc, argv) => boxNumber(argv[0].c.length, loc));
    mod.defoverload("length", [ThingType.map], (loc, argv) => boxNumber(argv[0].c.length, loc));
    mod.defsyntax("#x", 0, true, null, "__rewrite_length", rewriteAsApply([symbol_x], "__length"));
}

const empty_list_pattern = p("[^] [$]");
const empty_map_pattern = p("[^] : [$]");
const split_on_comma = p("[^] x... {, y...|} [$]");
const split_on_colon = p("[^] x... : y... [$]");
const implicit_key = p("[^] x... : [$]");
