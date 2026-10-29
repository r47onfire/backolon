import { javaHash } from "@r47onfire/game-math";
import { imul } from "lib0/math";
import { Dynamics, GrammarCombinator, Locals, MixAction, opDefs } from "./combinator";

export interface CombinatorWalker<T, E> {
    /** Turn one raw scalar value into a T. Called once per scalar,
     *  and once per element for scalar-array fields. */
    leaf(node: GrammarCombinator, field: string, action: MixAction, value: unknown, env: E): T;
    /** Fold one node from its folded fields: child fields carry the child's
     *  fold result, array fields appear as repeated entries in order. */
    fold(fields: readonly (readonly [field: string, action: MixAction, value: T])[], node: GrammarCombinator, env: E): T;    /** Substitute a node (and its environment) before folding it -- references. */
    resolve?(node: GrammarCombinator, env: E): { node: GrammarCombinator, env: E } | undefined;
    /** Adjust the environment for one child field -- scope-introducing nodes. */
    childEnv?(node: GrammarCombinator, field: string, action: MixAction, env: E): E;
    /** A finished value for this node, if already known: cancels the walk below it. */
    precomputed?: (node: GrammarCombinator, env: E) => T | undefined;
    /** Record a node's folded value for future `precomputed` hits. */
    memoize?: (node: GrammarCombinator, value: T, env: E) => void;
}

export const walkCombinator = <T, E>(g: GrammarCombinator, env: E, walker: CombinatorWalker<T, E>): T => {
    const pre = walker.precomputed?.(g, env);
    if (pre !== undefined) return pre;
    const sub = walker.resolve?.(g, env);
    if (sub !== undefined) return walkCombinator(sub.node, sub.env, walker);
    const fields: (readonly [string, MixAction, T])[] = [];
    for (var { 0: field, 1: action } of opDefs[g.op].hashFields) {
        const value = (g as any)[field] as unknown;
        if (value === undefined) continue;
        switch (action) {
            case MixAction.Child:
            case MixAction.AuxChild:
            case MixAction.ScopedChild:
                fields.push([field, action, walkCombinator(value as GrammarCombinator, walker.childEnv?.(g, field, action, env) ?? env, walker)]);
                break;
            case MixAction.Children:
                for (var c of (value as GrammarCombinator[])) fields.push([field, action, walkCombinator(c, walker.childEnv?.(g, field, action, env) ?? env, walker)]);
                break;
            default: // scalar actions: String, Number, Boolean, Text, StringArray
                if (Array.isArray(value)) {
                    for (const el of value) fields.push([field, action, walker.leaf(g, field, MixAction.String, el, env)]);
                } else {
                    fields.push([field, action, walker.leaf(g, field, action, value, env)]);
                }
        }
    }
    const result = walker.fold(fields, g, env);
    walker.memoize?.(g, result, env);
    return result;
};


const basicHash: CombinatorWalker<number, void> = {
    leaf(_node, _field, action, value) {
        switch (action) {
            case MixAction.String:
            case MixAction.Text:
            case MixAction.Tag: return javaHash(value as string);
            case MixAction.Number: return value as number;
            case MixAction.Boolean: return value ? 0xDEADBEEF : 0xC0FFEE99;
            default: throw new Error("unknown action " + MixAction[action]);
        }
    },
    fold(fields, node) {
        var h = javaHash(node.op);
        for (var { 1: action, 2: value } of fields)
            h = (imul(h, action === MixAction.AuxChild ? 37 : 31) + value!) >>> 0;
        return h;
    },
    precomputed: (node) => node.hash,
    memoize: (node, value) => { node.hash = value; },
};

/**
 * A hash of a combinator tree, driven by the `hashFields` of each
 * operation's definition: like trees hash alike. Without a resolver this is
 * a purely structural hash and is cached on the node itself, so hashing a
 * tree costs one walk, ever.
 */
export const hashCombinator = (g: GrammarCombinator): number => {
    return walkCombinator(g, undefined, basicHash);
}

type ResolveEnv = readonly [locals: Locals, dynamics: Dynamics];

/**
 * A hash of a combinator tree with its parameter references resolved:
 * `param` nodes contribute the hash of the argument they name (resolved in
 * the lexical scope), `ambient` nodes the hash of the dynamic binding they
 * name (resolved in the dynamic scope captured by that binding, so a
 * binding's value never depends on itself), and `bind` nodes hash their
 * body under the dynamic scope the bind creates. Nothing is cached, since
 * the result depends on the scopes, not just the tree.
 */
export const hashResolved = (g: GrammarCombinator, locals: Locals, dynamics: Dynamics, path: string): number => {
    return walkCombinator(g, [locals, dynamics] as ResolveEnv, {
        leaf: (basicHash as any as CombinatorWalker<number, ResolveEnv>).leaf,
        fold: (basicHash as any as CombinatorWalker<number, ResolveEnv>).fold,
        resolve(node, env) {
            if (node.op === "param") {
                for (var frame = env[0]; frame; frame = frame.next) {
                    const binding = frame.bindings[node.name];
                    if (binding) return { node: binding.node, env: [binding.locals, env[1]] as const };
                }
                if (node.default) return { node: node.default, env };
                throw new Error("unbound rule parameter " + node.name + " at " + path);
            }
            if (node.op === "ambient") {
                for (var dyn = env[1]; dyn; dyn = dyn.next) {
                    if (dyn.name === node.name) return { node: dyn.node, env: [dyn.locals, dyn.dynamics] as const };
                }
                if (node.default) return { node: node.default, env };
                throw new Error("unbound dynamic parameter " + node.name + " at " + path);
            }
            return undefined;
        },
        childEnv(node, _field, action, env) {
            if (action === MixAction.ScopedChild) {
                // only bind's body is ScopedChild: it folds under the
                // dynamic scope the bind creates
                const { name, value } = node as typeof node & { name: string, value: GrammarCombinator };
                return [env[0], { name, node: value, locals: env[0], dynamics: env[1], next: env[1], key: "" }] as const;
            }
            return env;
        },
    });
};
