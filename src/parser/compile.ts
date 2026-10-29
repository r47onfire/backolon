import { B_minus, B_plus, CallableSignature, Command, Fun, JSFun, JebVM } from "@r47onfire/jeb";
import { CSTNode } from "./cst";

/**
 * Condense a CST as much as possible, preserving metadata spans:
 *
 * * ignored children are removed
 * * unnamed container nodes are merged into their parent
 * * named nodes, text leaves, and error nodes stay as they are
 *
 * The root is always a named node since a parse always starts at a named rule.
 */
export const condenseCST = (cst: CSTNode): CSTNode => {
    const condensedChildren = (node: CSTNode): CSTNode[] =>
        (node.children ?? []).filter(child => !child.ignored).flatMap(condense);
    const condense = (node: CSTNode): CSTNode[] => {
        // error nodes stay whole, their children unexamined, as in toAST
        if (node.errorExpected !== undefined) return [node];
        // named nodes survive, with their children condensed
        if (node.type !== undefined)
            return [node.children === undefined ? node : { ...node, children: condensedChildren(node) }];
        // unnamed containers dissolve into their parent
        if (node.children !== undefined) return condensedChildren(node);
        // text leaves survive as they are
        return [node];
    };
    return condense(cst)[0]!;
}

/**
 * Hooks matching the rule name to handler type. T should be at minimum a JEB callable
 * (which can be a Javascript function already). The mapping is used by the handler for
 * any purpose, but is usually used to map variant to implementation (e.g "+" to {@link B_plus}
 * and "-" to {@link B_minus}.)
 */
export type CompilerTable<T> = Record<string, [fn: T, mapping?: Record<string, any>]>;

/**
 * Result from a single compile step. If any value in `tbc` is true, the corresponding template
 * value will be expected to be {@link CSTNode}s, and they will be compiled before returning.
 * If `post` is set then the result, after assembling, will be passed back into the `post` entry
 * in the table (as a single node)
 */
export interface CompileBuilder {
    val: any;
    tbc?: [CSTNode, PropertyKey[]][];
    post?: string | null;
}

export const syncCompile = (node: CSTNode, tab: CompilerTable<(items: any, table?: Record<string, any>) => CompileBuilder>, wrap: (compiled: any, node: CSTNode) => any, handleError: (message: any) => any): any => {
    const entry = tab[node.type!];
    var tbc, val, post;
    if (!entry) val = handleError(`don't know how to compile ${JSON.stringify(node.type)} node`);
    else try {
        ({ tbc, val, post } = entry[0](node.children!, entry[1]));
        if (tbc) for (var [node2, path] of tbc) {
            val = assignPath(val, syncCompile(node2, tab, wrap, handleError), path);
        }
        if (post) {
            val = syncCompile({ type: post, children: val } as CSTNode, tab, x => x, handleError);
        }
        // console.log("post-compile", node.type, val);
    } catch (e) {
        val = handleError(e);
    }
    return wrap(val, node);
}

export const assignPath = <T>(val: T, obj: any, path: PropertyKey[]): T => {
    var x: any = val;
    if (path.length > 0) {
        for (var i = 0; i < path.length - 1; i++) {
            x = x[path[i]!];
        }
        // console.log("before set", x, path[i], obj);
        x[path[i]!] = obj;
        // console.log("after set", x);
    }
    else val = obj;
    return val;
}
