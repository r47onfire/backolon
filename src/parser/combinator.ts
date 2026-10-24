import { javaHash } from "@r47onfire/game-math";
import { imul, max } from "lib0/math";
import { CSTNode } from "./cst";
import { isArray } from "lib0/array";
import { stringify } from "lib0/json";

/** A grammar: rule names mapped to their definitions. */
export type Grammar = Readonly<Record<string, GrammarCombinator | ParameterizedRule>>;

/**
 * A parameterized rule definition: the parameter names, and the rule body.
 * Inside the body, `param(name)` evaluates the combinator that was passed
 * for that parameter at the call site (in the call site's scope).
 */
export type ParameterizedRule = readonly [params: readonly string[], body: GrammarCombinator];

/**
 * The fields of every operation's node, one entry per operation. This is
 * the single source the rest of the combinator types are derived from:
 * {@link GrammarOp} is its keys, {@link GrammarCombinator} is the union of
 * its shapes (plus the common base), and the `opDefs` table is checked
 * against it -- a `create` that returns anything else, or a `hashFields`
 * entry naming a field that does not exist, is a type error.
 */
export interface OpNodeShapes {
    literal: { pattern: string | [string, string] };
    keyword: { tag: string, options: string[] };
    ignored: { child: GrammarCombinator };
    rule: { name: string, args: GrammarCombinator[] };
    param: { name: string, default: GrammarCombinator | undefined };
    ambient: { name: string, default: GrammarCombinator | undefined };
    bind: { name: string, value: GrammarCombinator, extend: boolean, body: GrammarCombinator };
    sequence: { items: GrammarCombinator[], separator: GrammarCombinator | undefined };
    alternatives: { options: GrammarCombinator[], first?: boolean };
    optional: { child: GrammarCombinator };
    repeat: { items: GrammarCombinator[], required: boolean };
    joined: { joiner: GrammarCombinator, element: GrammarCombinator, require2: boolean, trailing: boolean };
    if: { condition: GrammarCombinator, ifTrue: GrammarCombinator, ifFalse: GrammarCombinator };
    tag: { tag: string, child: GrammarCombinator };
    cut: { depth: number };
    lookahead: { positive: boolean, child: GrammarCombinator };
    nonempty: { child: GrammarCombinator };
    sameline: { child: GrammarCombinator };
    nothing: {};
    try: { child: GrammarCombinator };
    die: { message: string };
}

/**
 * The operation a {@link GrammarCombinator} performs; determines which of
 * the per-operation subtypes a node is, and so which named fields it has.
 */
export type GrammarOp = keyof OpNodeShapes;

/** Every subtype carries a lazily filled cache of its structural hash (see {@link hashCombinator}). */
interface CombinatorBase {
    /** cached structural hash; filled in by {@link hashCombinator} */
    hash?: number;
    readonly op: string;
}

/**
 * A single grammar node. Combinators are plain serializable data (no
 * functions), so grammars can be built, inspected, and patched as values.
 * Each operation has its own subtype with explicitly named fields; the
 * per-operation definitions (how a node is created, parsed, hashed, and
 * rendered) live together in the `opDefs` table below.
 */
export type GrammarCombinator = { [O in GrammarOp]: CombinatorBase & { readonly op: O } & OpNodeShapes[O] }[GrammarOp];

/**
 * Resolves a reference node (`param`, `ambient`, or `bind`) to the hash of
 * what it refers to, for {@link hashCombinator}. `hashChild` hashes a node
 * with the same resolver in effect. Returning `undefined` means "not a
 * reference I resolve": the node is hashed structurally instead.
 */
export type ReferenceResolver = (node: GrammarCombinator, hashChild: (child: GrammarCombinator) => number) => number | undefined;

/**
 * A hash of a combinator tree, driven by the `hashFields` of each
 * operation's definition: like trees hash alike. Without a resolver this is
 * a purely structural hash and is cached on the node itself, so hashing a
 * tree costs one walk, ever. With a resolver (used by the parser to tell
 * parameterized rule instances apart), reference nodes contribute the hash
 * of what they resolve to in the current scopes instead of their own shape,
 * and nothing is cached -- the result depends on the scopes, not just the
 * tree.
 */
export const hashCombinator = (g: GrammarCombinator, resolve?: ReferenceResolver): number => {
    if (!resolve && g.hash !== undefined) return g.hash;
    if (resolve) {
        const resolved = resolve(g, child => hashCombinator(child, resolve));
        if (resolved !== undefined) return resolved;
    }
    var h = javaHash(g.op);
    const mix = (x: number, prime: number) => h = (imul(h, prime) + x) >>> 0;
    for (var { 0: field, 1: action } of opDefs[g.op].hashFields) {
        const value = (g as any)[field] as unknown;
        if (value === undefined) continue;
        switch (action) {
            case MixAction.String: mix(javaHash(value as string), 31); break;
            case MixAction.Number: mix(value as number, 31); break;
            case MixAction.Boolean: mix(value ? 1 : 0, 31); break;
            case MixAction.Text:
                if (typeof value === "string") mix(javaHash(value), 31);
                else for (const s of value as readonly string[]) mix(javaHash(s), 31);
                break;
            case MixAction.StringArray: for (const s of value as readonly string[]) mix(javaHash(s), 31); break;
            case MixAction.Child: mix(hashCombinator(value as GrammarCombinator, resolve), 31); break;
            case MixAction.Children: for (const child of value as readonly GrammarCombinator[]) mix(hashCombinator(child, resolve), 31); break;
            case MixAction.AuxChild: mix(hashCombinator(value as GrammarCombinator, resolve), 37); break;
        }
    }
    if (!resolve) g.hash = h;
    return h;
};

/**
 * A hash of a combinator tree with its parameter references resolved:
 * `param` nodes contribute the hash of the argument they name (resolved in
 * the lexical scope), `ambient` nodes the hash of the dynamic binding they
 * name (resolved in the dynamic scope captured by that binding, so a
 * binding's value never depends on itself), and `bind` nodes hash their
 * body under the dynamic scope the bind creates. An unbound reference with
 * a default contributes the default's hash. This is the one hash function,
 * {@link hashCombinator}, driven by a resolver; nothing is cached, since
 * the result depends on the scopes, not just the tree.
 */
export const hashResolved = (g: GrammarCombinator, locals: Locals, dynamics: Dynamics, path: string): number => {
    const resolveWith = (scopeLocals: Locals, scopeDynamics: Dynamics): ReferenceResolver => (node, hashChild) => {
        if (node.op === "param") {
            for (var frame = scopeLocals; frame; frame = frame.next) {
                const binding = frame.bindings[node.name];
                if (binding) return hashCombinator(binding.node, resolveWith(binding.locals, scopeDynamics));
            }
            if (node.default) return hashChild(node.default);
            throw new Error("unbound rule parameter " + node.name + " at " + path);
        }
        if (node.op === "ambient") {
            for (var dyn = scopeDynamics; dyn; dyn = dyn.next) {
                if (dyn.name === node.name) return hashCombinator(dyn.node, resolveWith(dyn.locals, dyn.dynamics));
            }
            if (node.default) return hashChild(node.default);
            throw new Error("unbound dynamic parameter " + node.name + " at " + path);
        }
        if (node.op === "bind") {
            // The body is hashed under the dynamic scope the bind creates:
            // its own binding is visible to ambient references inside it.
            const { name, value, body } = node;
            const inner: Dynamics = { name, node: value, locals: scopeLocals, dynamics: scopeDynamics, next: scopeDynamics, key: "" };
            const childHashes: Record<string, number> = {
                value: hashCombinator(value, hashChild),
                body: hashCombinator(body, resolveWith(scopeLocals, inner)),
            };
            var h = javaHash(node.op);
            for (var { 0: field, 1: action } of opDefs.bind.hashFields) {
                if (action === MixAction.Child) h = (imul(h, 31) + childHashes[field]!) >>> 0;
                else if (action === MixAction.String) h = (imul(h, 31) + javaHash((node as any)[field] as string)) >>> 0;
            }
            return h;
        }
        return undefined;
    };
    return hashCombinator(g, resolveWith(locals, dynamics));
}

/**
 * The memo path of a parameterized rule invocation names the instance by
 * the rule name plus the resolved hashes of its arguments (see
 * {@link hashResolved}), so different instances of the same rule memoize
 * separately. Resolving matters: `rule("e", param("op"))` inside a rule
 * where `op` is bound to `lit("+")` is the *same* instance as
 * `rule("e", lit("+"))` (in particular, a rule recursing on its own
 * parameters recurses on itself, so left recursion still engages).
 */
const instancePath = (name: string, args: readonly GrammarCombinator[], locals: Locals, dynamics: Dynamics, path: string): string =>
    name + "(" + args.map(a => hashResolved(a, locals, dynamics, path).toString(36)).join(",") + ")";

/**
 * A failed match. `i` is the index where the failure occurred (used for
 * error reporting), `cut` is the remaining cut depth (Infinity for `die`),
 * and `expected` is the combinator that failed to match.
 */
export class MatchFail {
    constructor(readonly i: number, readonly cut: number, readonly expected: GrammarCombinator) { }
}

/**
 * One argument binding of a parameterized rule invocation: the argument
 * combinator, plus the parameter scope in effect where the argument was
 * written, so that evaluating it later (via the `param` op) resolves any
 * parameters it mentions in the call site's scope, not the callee's.
 */
export interface ParamBinding {
    readonly node: GrammarCombinator,
    readonly locals: Locals
}

/**
 * A parameter scope: the bindings of one parameterized rule invocation,
 * chained to the enclosing scope. Scopes are threaded through the parse as
 * immutable values, so speculative branches (alternatives, lookaheads,
 * recovery probes) can never disturb each other's bindings.
 */
export interface ParamFrame {
    readonly bindings: Readonly<Record<string, ParamBinding>>,
    readonly next: Locals
}
export type Locals = ParamFrame | undefined;

/**
 * The dynamic scope: a chain of dynamic bindings (bound value, scopes in which
 * it was created), innermost first. Like the lexical scope it is threaded through
 * the parse as an immutable value, so speculative branches cannot disturb each
 * other's bindings. `key` identifies this exact chain; while a chain is in effect
 * its key is part of every memo identity, so a result that depends on ambient
 * context is never reused under a different context.
 */
export interface DynBindingFrame {
    readonly name: string,
    readonly node: GrammarCombinator,
    readonly locals: Locals,
    readonly dynamics: Dynamics
    readonly next: Dynamics,
    readonly key: string
}
export type Dynamics = DynBindingFrame | undefined;

/** How one field of a combinator is mixed into its hash (see `hashFields` on {@link GrammarOpDef}). */
export enum MixAction {
    /** a string, hashed with javaHash */
    String,
    /** a number, mixed as-is */
    Number,
    /** a boolean, mixed as 1 or 0 */
    Boolean,
    /** a string or an array of strings (each hashed with javaHash) */
    Text,
    /** an array of strings (each hashed with javaHash) */
    StringArray,
    /** a single sub-combinator, hashed recursively */
    Child,
    /** an array of sub-combinators, each hashed recursively */
    Children,
    /** a single sub-combinator in the auxiliary role (separator, joiner, condition), hashed recursively with a different constant so it cannot be confused with a sequential child */
    AuxChild,
}

/**
 * The services an operation's `call` needs from the parser: the input, the
 * grammar, the memoizing entry point for sub-parses, error recovery, and
 * the cut bookkeeping. Provided by `parseToCST`; see there for what each
 * one does.
 */
export interface OpContext {
    readonly text: string;
    readonly grammar: Grammar;
    applyRule(path: string, node: GrammarCombinator, i: number, locals: Locals, dynamics: Dynamics): CSTNode | MatchFail;
    errorNode(start: number, end: number, expected: GrammarCombinator): CSTNode;
    /**
     * Panic-mode recovery: scan forward for the next index where `item` matches,
     * turning all skipped source into a single error node. Returns the index to
     * continue parsing from. If nothing works, emits an error up to end of input.
     *
     * Only used when NOT inside a committed scope. Inside one, the enclosing
     * construct owns resynchronization (seq_sep rescans for its failed child;
     * repeats emit a minimal error), so no bracket guessing is needed.
     */
    recover(path: string, item: GrammarCombinator, i: number, fail: MatchFail, children: CSTNode[], locals: Locals, dynamics: Dynamics): number;
    /**
     * Local recovery for a sequence with a fail after a cut.
     * Resynchronize to the nearest position where that child matches, keeping the committed prefix intact.
     * Returns the index to continue from, or null if the child never matches (give up and propagate the fail).
     *
     * The skipped text becomes a BAD node that carries the recovered child in its `recovered` field.
     * This keeps the sequence's fixed arity while still allowing the parse to recover later
     */
    recoverChild(path: string, child: GrammarCombinator, i: number, fail: MatchFail, children: CSTNode[], locals: Locals, dynamics: Dynamics): number | null;
    /** Cut depth of the innermost open rule frame (0 if there is none). */
    cutDepth(): number;
    /** Marks the innermost frame's cut as consumed by the current alternative. */
    consumeCut(): void;
    /** How many open frames currently hold a cut. */
    committedDepth(): number;
    /** A snapshot of the cut stack's depths, for speculative parses. */
    snapshotCuts(): readonly number[];
    /** Restores a snapshot taken with {@link OpContext.snapshotCuts}. */
    restoreCuts(saved: readonly number[]): void;
    /** Pushes a fresh cut frame for a rule invocation. */
    pushCutFrame(): void;
    /** Pops the innermost cut frame and returns the depth it reached. */
    popCutFrame(): number;
    /** Records a cut of the given depth in the innermost frame. */
    applyCut(depth: number): void;
    /**
     * True if an enclosing construct has committed (cut) without finishing yet.
     * Resyncs inside such a scope must stay local to it!
     */
    inCommittedScope(): boolean;
}

/**
 * The definition of one grammar operation: how its nodes are created
 * (`create`, also exported as the operation's factory function), how they
 * are parsed (`call`), which of their fields feed the combinator hash
 * (`hashFields`), and how they are rendered for debugging (`describe`).
 * Keeping all four together in this table is what lets the parser's
 * dispatcher, the hash function, and the debug renderer stay generic
 * over operations. This is the loose common shape of a definition; each
 * entry in {@link opDefs} is more precise (its `call` and `describe` are
 * typed against the exact node shape its own `create` returns).
 */
export interface GrammarOpDef {
    create: (...args: any[]) => any;
    call: (ctx: OpContext, node: any, path: string, i: number, locals: Locals, dynamics: Dynamics) => CSTNode | MatchFail;
    hashFields: readonly (readonly [field: string, action: MixAction])[];
    describe: (node: any) => string;
}

/** A {@link GrammarOpDef} made precise for one operation's node shape `N`: `create` returns `N`, `call` and `describe` receive the whole node (`N` plus the common base), and `hashFields` may only name fields of `N`. */
export interface GrammarOpDefFor<N> {
    create: (...args: any[]) => N;
    call: (ctx: OpContext, node: N, path: string, i: number, locals: Locals, dynamics: Dynamics) => CSTNode | MatchFail;
    hashFields: readonly (readonly [field: keyof N, action: MixAction])[];
    describe: (node: N) => string;
}

const singleChild = (n: GrammarCombinator) => ({ child: n });

/** The (weak) type of {@link opDefs}: every operation's definition, tied to its declared node shape in {@link OpNodeShapes}. */
export type OpDefs = { [O in GrammarOp]: GrammarOpDefFor<OpNodeShapes[O]> };

/** The definition of every grammar operation, keyed by its `op`. */
export const opDefs = {

    // ---------------------------------------------------------------------------
    // tok

    literal: {
        create: (pattern: string | [string, string]) => ({ pattern }),
        call(ctx, node, _, i) {
            const pattern = node.pattern;
            if (isArray(pattern)) {
                const re = new RegExp(pattern[0], pattern[1] + "y");
                re.lastIndex = i;
                const match = re.exec(ctx.text);
                return match ? { text: match[0], start: i, end: i + match[0].length } : new MatchFail(i, 0, node as GrammarCombinator);
            }
            return ctx.text.startsWith(pattern, i) ? { text: pattern, start: i, end: i + pattern.length } : new MatchFail(i, 0, node as GrammarCombinator);
        },
        hashFields: [["pattern", MixAction.Text]],
        describe: ({ pattern }) => isArray(pattern) ? "/" + pattern[0] + "/" + pattern[1] : stringify(pattern),
    },

    // ---------------------------------------------------------------------------
    // kw


    keyword: {
        create: (t: string, ...options: string[]) => ({ tag: t, options }),
        call(ctx, node, _, i) {
            const { options, tag } = node;
            const re = new RegExp("\\b(" + options.map(RegExp.escape).join("|") + ")\\b", "y");
            re.lastIndex = i;
            const match = re.exec(ctx.text);
            return match ? { text: match[0], tag, start: i, end: i + match[0].length, ignored: true } : new MatchFail(i, 0, node as GrammarCombinator);
        },
        hashFields: [["tag", MixAction.String], ["options", MixAction.StringArray]],
        describe: ({ tag, options }) => "%" + tag + "=" + options.join("/"),
    },

    // ---------------------------------------------------------------------------
    // ign

    ignored: {
        create: singleChild,
        call(ctx, { child }, path, i, locals, dynamics) {
            const cst = ctx.applyRule(path + "/", child, i, locals, dynamics);
            return cst instanceof MatchFail ? cst : { ignored: true, start: cst.start, end: cst.end, children: [cst] };
        },
        hashFields: [["child", MixAction.Child]],
        describe: ({ child }) => "," + describeCombinator(child),
    },

    // ---------------------------------------------------------------------------
    // rule

    rule: {
        create: (r: string, ...args: GrammarCombinator[]) => ({ name: r, args }),
        call(ctx, { name, args = [] }, path, i, locals, dynamics) {
            const entry = ctx.grammar[name];
            if (!entry) throw new Error("unknown named rule " + name + " at " + path);
            var body: GrammarCombinator, bodyPath = name, bodyLocals = locals;
            if (isArray(entry)) {
                // Parameterized rule: bind the arguments (all required, no
                // defaults), each capturing the scope in effect at this call
                // site, and evaluate the body under a memo path that names the
                // instance (the rule name plus the hashes of its argument
                // combinators), so that different instances of the same rule
                // memoize separately.
                const { 0: params, 1: ruleBody } = entry;
                if (args.length !== params.length) throw new Error("rule " + name + " takes " + params.length + " argument(s) but got " + args.length + " at " + path);
                const bindings: Record<string, ParamBinding> = {};
                for (var k = 0; k < params.length; k++) bindings[params[k]!] = { node: args[k]!, locals };
                body = ruleBody;
                bodyPath = instancePath(name, args, locals, dynamics, path);
                bodyLocals = { bindings, next: locals };
            } else {
                if (args.length) throw new Error("rule " + name + " takes no arguments at " + path);
                body = entry as GrammarCombinator;
            }
            ctx.pushCutFrame();
            const cst = ctx.applyRule(bodyPath, body, i, bodyLocals, dynamics);
            const frameDepth = ctx.popCutFrame();
            if (cst instanceof MatchFail) {
                const d = max(cst.cut, frameDepth);
                return d === cst.cut ? cst : new MatchFail(cst.i, d, cst.expected);
            }
            // Don't nest when the rule only delegated to another named rule
            if (cst.text === undefined && typeof cst.type === "string") return cst;
            return { type: name, start: cst.start, end: cst.end, children: [cst] };
        },
        hashFields: [["name", MixAction.String], ["args", MixAction.Children]],
        describe: ({ name, args }) => "<" + name + (args.length ? "(" + args.map(arg => describeCombinator(arg)).join(", ") + ")" : "") + ">",
    },

    // ---------------------------------------------------------------------------
    // param

    param: {
        create: (p: string, defaultValue?: GrammarCombinator) => ({ name: p, default: defaultValue }),
        call(ctx, { name, default: defaultValue }, path, i, locals, dynamics) {
            for (var scope = locals; scope; scope = scope.next) {
                const binding = scope.bindings[name];
                // Evaluate the argument under its own memo path: the memo is
                // keyed by path alone, so reusing this reference's path would
                // collide with the param op's own in-progress entry. The
                // argument's own parameters resolve in the scope it captured,
                // but any dynamic parameters it mentions resolve in the
                // ambient context in effect here, at its use.
                if (binding) return ctx.applyRule(path + "$" + name, binding.node, i, binding.locals, dynamics);
            }
            if (defaultValue) return ctx.applyRule(path + "$" + name, defaultValue, i, locals, dynamics);
            throw new Error("unbound rule parameter " + name + " at " + path);
        },
        hashFields: [["name", MixAction.String], ["default", MixAction.Child]],
        describe: ({ name, default: defaultValue }) => "$" + name + (defaultValue ? ":" + describeCombinator(defaultValue) : ""),
    },

    // ---------------------------------------------------------------------------
    // ambient

    ambient: {
        create: (p: string, defaultValue?: GrammarCombinator) => ({ name: p, default: defaultValue }),
        call(ctx, { name, default: defaultValue }, path, i, locals, dynamics) {
            for (var dyn = dynamics; dyn; dyn = dyn.next) {
                // As with param, the value gets its own memo path -- and the
                // path names the binding's frame key, because the same
                // reference under different bindings must not share a memo
                // entry even though the value is evaluated in the scope
                // outside the bind. It is evaluated with the lexical scope of
                // the bind that supplied it, and the dynamic scope outside
                // that bind.
                if (dyn.name === name) return ctx.applyRule(path + "$@" + name + "#" + dyn.key, dyn.node, i, dyn.locals, dyn.dynamics);
            }
            if (defaultValue) return ctx.applyRule(path + "$@" + name, defaultValue, i, locals, dynamics);
            throw new Error("unbound dynamic parameter " + name + " at " + path);
        },
        hashFields: [["name", MixAction.String], ["default", MixAction.Child]],
        describe: ({ name, default: defaultValue }) => "@" + name + (defaultValue ? ":" + describeCombinator(defaultValue) : ""),
    },

    // ---------------------------------------------------------------------------
    // bind

    bind: {
        create: (p: string, extend: boolean, value: GrammarCombinator, body: GrammarCombinator) => ({ name: p, value, extend, body }),
        call(ctx, { name, value, extend, body }, path, i, locals, dynamics) {
            const frame: DynBindingFrame = {
                name,
                node: extend ? seq(ambient(name, nothing()), value) : value,
                locals,
                dynamics,
                next: dynamics,
                key: (dynamics ? dynamics.key + "/" : "") + name + "#" + hashResolved(value, locals, dynamics, path).toString(36),
            };
            return ctx.applyRule(path + "/b", body, i, locals, frame);
        },
        hashFields: [["name", MixAction.String], ["value", MixAction.Child], ["extend", MixAction.Boolean], ["body", MixAction.Child]],
        describe: ({ name, value, extend, body }) => (extend ? "&+" : "&") + name + "=" + describeCombinator(value) + "-" + describeCombinator(body),
    },

    // ---------------------------------------------------------------------------
    // seq / ssep

    sequence: {
        create: (s: GrammarCombinator | undefined, ...n: GrammarCombinator[]) => ({ items: n, separator: s }),
        call(ctx, node, path, i, locals, dynamics) {
            const children: CSTNode[] = [];
            const start = i;
            const { items, separator } = node, len = items.length;
            const currentCut = ctx.cutDepth();
            for (var j = 0; j < len; j++) {
                // try sep between items only
                if (j > 0 && separator) {
                    const sepThing = ctx.applyRule(path + "/s", separator, i, locals, dynamics);
                    if (sepThing instanceof MatchFail) {
                        children.push({ ignored: true, start: i, end: i });
                    } else {
                        children.push({ ignored: true, start: sepThing.start, end: sepThing.end, children: [sepThing] });
                        i = sepThing.end;
                    }
                }
                const child = items[j]!;
                const thisMatch = ctx.applyRule(path + "/" + j, child, i, locals, dynamics);
                if (thisMatch instanceof MatchFail) {
                    if (thisMatch.cut === Infinity) return thisMatch;
                    if (ctx.cutDepth() > currentCut) {
                        // we did another cut inside
                        // resync to the failed child (without breaking the outer grammar node)
                        if (ctx.committedDepth() > 1) return thisMatch;
                        const resumed = ctx.recoverChild(path + "/" + j, child, i, thisMatch, children, locals, dynamics);
                        if (resumed === null) return thisMatch;
                        i = resumed;
                        continue;
                    }
                    return thisMatch;
                }
                children.push(thisMatch);
                i = thisMatch.end;
            }
            return { start, end: i, children };
        },
        hashFields: [["items", MixAction.Children], ["separator", MixAction.AuxChild]],
        describe: ({ items, separator }) => items.length === 0 && !separator ? "\u03B5" : (separator ? describeCombinator(separator) + ".@(" : "(") + items.map(c => describeCombinator(c)).join(" ") + ")",
    },

    // ---------------------------------------------------------------------------
    // alt

    alternatives: {
        create: (first: boolean, ...n: GrammarCombinator[]) => ({ options: n, first }),
        call(ctx, node, path, i, locals, dynamics) {
            const { options: items, first } = node, len = items.length;
            const options: CSTNode[] = [];
            var furthestFail: MatchFail | undefined;
            for (var j = 0; j < len; j++) {
                const depthBefore = ctx.cutDepth();
                const thisMatch = ctx.applyRule(path + "/" + j, items[j]!, i, locals, dynamics);
                if (thisMatch instanceof MatchFail) {
                    const childCut = thisMatch.cut;
                    const d = max(thisMatch.cut, ctx.cutDepth());
                    if (d === 0) {
                        // track the furthest failure for better error messages
                        if (!furthestFail || thisMatch.i > furthestFail.i) furthestFail = thisMatch;
                        continue;
                    }
                    ctx.consumeCut();
                    // propagate the child's cut depth unchanged; only decrement if the cut was from this level
                    const newCut = childCut > 0 ? childCut : d - 1;
                    return new MatchFail(thisMatch.i, newCut, thisMatch.expected);
                }
                // A cut inside a successful alternative commits the choice:
                // return it now instead of letting a later, longer alternative win.
                // Alternatively, if we're intended to return the first one, do that.
                if (ctx.cutDepth() > depthBefore || first) return thisMatch;
                options.push(thisMatch);
            }
            return options.length < 1 ? (furthestFail ?? new MatchFail(i, 0, node as GrammarCombinator)) : options.reduce((a, b) => b.end > a.end ? b : a);
        },
        hashFields: [["options", MixAction.Children], ["first", MixAction.Boolean]],
        describe: ({ options }) => options.length === 0 ? "(|)" : "(" + options.map(c => describeCombinator(c)).join(" | ") + ")",
    },

    // ---------------------------------------------------------------------------
    // opt

    optional: {
        create: singleChild,
        call(ctx, { child }, path, i, locals, dynamics) {
            const cst = ctx.applyRule(path + "/", child, i, locals, dynamics);
            // don't swallow a cut fail
            return cst instanceof MatchFail ? (cst.cut > 0 ? cst : { start: i, end: i }) : cst;
        },
        hashFields: [["child", MixAction.Child]],
        describe: ({ child }) => describeCombinator(child) + "?",
    },

    // ---------------------------------------------------------------------------
    // rep

    repeat: {
        create: (r: boolean, n: GrammarCombinator) => ({ items: [n], required: r }),
        call(ctx, { items: nodes, required }, path, i, locals, dynamics) {
            const start = i;
            const children: CSTNode[] = [];
            const len = nodes.length;
            if (len > 0) {
                for (var count = 0; ; count++) {
                    if (i >= ctx.text.length) break;
                    const item = nodes[count % len]!;
                    const thisMatch = ctx.applyRule(path + "/*", item, i, locals, dynamics);
                    if (thisMatch instanceof MatchFail) {
                        if (thisMatch.cut === Infinity) return thisMatch;
                        if (thisMatch.cut > 0) {
                            if (ctx.inCommittedScope()) {
                                // don't leak cuts, to allow resync
                                const end = max(thisMatch.i, i + 1);
                                children.push(ctx.errorNode(i, end, thisMatch.expected));
                                i = end;
                                continue;
                            }
                            // Not committed: panic-mode resync to next match.
                            const next = ctx.recover(path + "/*", item, i, thisMatch, children, locals, dynamics);
                            if (next <= i) break; // nowhere left to go
                            i = next;
                            continue;
                        }
                        if (required && count < 1) return thisMatch;
                        // normal failure
                        break;
                    }
                    if (thisMatch.end === i) break; // no progress = stop
                    children.push(thisMatch);
                    i = thisMatch.end;
                }
            }
            return { start, end: i, children };
        },
        hashFields: [["items", MixAction.Children], ["required", MixAction.Boolean]],
        describe: ({ items, required }) => items.map(c => describeCombinator(c)).join("") + (required ? "+" : "*"),
    },

    // ---------------------------------------------------------------------------
    // joined

    joined: {
        create: (j: GrammarCombinator, n: GrammarCombinator, r2: boolean, t: boolean) => ({ joiner: j, element: n, require2: r2, trailing: t }),
        call(ctx, { element: elemRule, joiner: sepRule, require2, trailing }, path, i, locals, dynamics) {
            const start = i;
            const children: CSTNode[] = [];
            const minimum = require2 ? 3 : 1; // children interleave elements and separators: two elements are 3 children
            for (; ;) {
                if (i >= ctx.text.length) {
                    if (children.length < minimum) return new MatchFail(i, 0, elemRule);
                    break;
                }
                const elem = ctx.applyRule(path + "/e", elemRule, i, locals, dynamics);
                if (elem instanceof MatchFail) {
                    if (elem.cut === Infinity) return elem;
                    if (elem.cut > 0) {
                        if (ctx.inCommittedScope()) {
                            // Inside a committed construct: keep it local.
                            const end = max(elem.i, i + 1);
                            children.push(ctx.errorNode(i, end, elem.expected));
                            i = end;
                            continue;
                        }
                        const next = ctx.recover(path + "/e", elemRule, i, elem, children, locals, dynamics);
                        if (next <= i) break;
                        i = next;
                        continue;
                    }
                    if (children.length < minimum) return elem; // need at least one or two elements
                    // trailing sep is cut-fail
                    if (trailing) break;
                    return new MatchFail(elem.i, 1, elem.expected);
                }
                children.push(elem);
                i = elem.end;
                const s = ctx.applyRule(path + "/s", sepRule, i, locals, dynamics);
                if (s instanceof MatchFail) {
                    if (s.cut === Infinity) return s;
                    if (s.cut > 0) {
                        if (ctx.inCommittedScope()) {
                            const end = max(s.i, i + 1);
                            children.push(ctx.errorNode(i, end, s.expected));
                            i = end;
                            continue;
                        }
                        const next = ctx.recover(path + "/s", sepRule, i, s, children, locals, dynamics);
                        if (next <= i) break;
                        i = next;
                        continue;
                    }
                    if (children.length < minimum) return s; // need at least one or two elements
                    break; // no separator: done
                }
                if (s.end === i) break; // empty separator ?!?
                children.push(s);
                i = s.end;
            }
            return { start, end: i, children };
        },
        hashFields: [["element", MixAction.Child], ["joiner", MixAction.AuxChild], ["require2", MixAction.Boolean], ["trailing", MixAction.Boolean]],
        describe: ({ element, joiner }) => describeCombinator(joiner) + "." + describeCombinator(element) + "+",
    },

    // ---------------------------------------------------------------------------
    // if

    if: {
        create: (c: GrammarCombinator, t: GrammarCombinator, f: GrammarCombinator) => ({ condition: c, ifTrue: t, ifFalse: f }),
        call: (ctx, { condition, ifTrue, ifFalse }, path, i, locals, dynamics) =>
            ctx.applyRule(path + "/c", condition, i, locals, dynamics) instanceof MatchFail
                ? ctx.applyRule(path + "/f", ifFalse, i, locals, dynamics)
                : ctx.applyRule(path + "/t", ifTrue, i, locals, dynamics),
        hashFields: [["condition", MixAction.AuxChild], ["ifTrue", MixAction.Child], ["ifFalse", MixAction.Child]],
        describe: ({ condition, ifTrue: if_true, ifFalse: if_false }) => "(?(" + describeCombinator(condition) + ") " + describeCombinator(if_true) + " // " + describeCombinator(if_false) + ")",
    },

    // ---------------------------------------------------------------------------
    // tag

    tag: {
        create: (t: string, n: GrammarCombinator) => ({ tag: t, child: n }),
        call(ctx, node, path, i, locals, dynamics) {
            const { tag: tagName, child } = node;
            const cst = ctx.applyRule(path + "/", child, i, locals, dynamics);
            return cst instanceof MatchFail ? cst : { tag: tagName, start: cst.start, end: cst.end, children: [cst] };
        },
        hashFields: [["tag", MixAction.String], ["child", MixAction.Child]],
        describe: ({ tag, child }) => "#" + tag + "=" + describeCombinator(child),
    },

    // ---------------------------------------------------------------------------
    // cut

    cut: {
        create: (d = 1) => ({ depth: d }),
        call(ctx, { depth }, _, i) {
            ctx.applyCut(depth);
            return { ignored: true, start: i, end: i };
        },
        hashFields: [["depth", MixAction.Number]],
        describe: ({ depth }) => "!" + depth,
    },

    // ---------------------------------------------------------------------------
    // lookahead

    lookahead: {
        create: (p: boolean, n: GrammarCombinator) => ({ positive: p, child: n }),
        call(ctx, node, path, i, locals, dynamics) {
            const { positive, child } = node;
            const cst = ctx.applyRule(path + "/?", child, i, locals, dynamics);
            return (cst instanceof MatchFail) !== positive ? { ignored: true, start: i, end: i } : new MatchFail(i, 0, node as GrammarCombinator);
        },
        hashFields: [["positive", MixAction.Boolean], ["child", MixAction.Child]],
        describe: ({ positive, child }) => "(?" + (positive ? "=" : "!") + describeCombinator(child) + ")",
    },

    // ---------------------------------------------------------------------------
    // nonempty / sameline

    nonempty: {
        create: singleChild,
        call(ctx, node, path, i, locals, dynamics) {
            const { child } = node;
            const cst = ctx.applyRule(path + "/", child, i, locals, dynamics);
            return cst instanceof MatchFail ? cst : cst.end === i ? new MatchFail(i, 0, node as GrammarCombinator) : cst;
        },
        hashFields: [["child", MixAction.Child]],
        describe: ({ child }) => "(+" + describeCombinator(child) + ")",
    },

    sameline: {
        create: singleChild,
        call(ctx, node, path, i, locals, dynamics) {
            const { child } = node;
            const cst = ctx.applyRule(path + "/", child, i, locals, dynamics);
            return cst instanceof MatchFail ? cst : ctx.text.slice(cst.start, cst.end).indexOf("\n") >= 0 ? new MatchFail(i, 0, node as GrammarCombinator) : cst;
        },
        hashFields: [["child", MixAction.Child]],
        describe: ({ child }) => "(=" + describeCombinator(child) + ")",
    },

    // ---------------------------------------------------------------------------
    // eps

    nothing: {
        create: () => ({}),
        call: (_, __, ___, i) => ({ start: i, end: i }),
        hashFields: [],
        describe: () => "()",
    },

    // ---------------------------------------------------------------------------
    // try

    try: {
        create: singleChild,
        call(ctx, { child }, path, i, locals, dynamics) {
            // Speculative parse: if node fails, hide the cuts
            const savedCuts = ctx.snapshotCuts();
            const cst = ctx.applyRule(path + "/", child, i, locals, dynamics);
            if (cst instanceof MatchFail) {
                ctx.restoreCuts(savedCuts);
                return new MatchFail(cst.i, 0, cst.expected);
            }
            return cst;
        },
        hashFields: [["child", MixAction.Child]],
        describe: ({ child }) => "[" + describeCombinator(child) + "]",
    },

    // ---------------------------------------------------------------------------
    // die

    die: {
        create: (m: string) => ({ message: m }),
        call: (_, node, __, i) => new MatchFail(i, Infinity, node as GrammarCombinator),
        hashFields: [["message", MixAction.String]],
        describe: ({ message }) => "^" + stringify(message),
    },

    // ---------------------------------------------------------------------------

} satisfies OpDefs;

function createCombinator<T extends GrammarOp>(type: T, ...args: Parameters<typeof opDefs[T]["create"]>): CombinatorBase & { readonly op: T } & OpNodeShapes[T] {
    const fields = (opDefs[type] as GrammarOpDef).create(...args) as OpNodeShapes[T];
    return { ...fields, op: type };
}
function createCombinatorMaker<T extends GrammarOp>(type: T) {
    return (...args: Parameters<typeof opDefs[T]["create"]>) => createCombinator(type, ...args);
}

/** Matches the literal string `p` exactly; produces a leaf holding that text. */
export const lit = (s: string) => createCombinator("literal", s);
/** Matches the regex `p` anchored at the current position (the engine adds the sticky flag); produces a leaf holding the matched text. The pattern is stored as `[source, flags]` to keep combinators plain data. */
export const regex = (p: RegExp) => createCombinator("literal", [p.source, p.flags]);
/** Matches any one of the given options between regex \b separators; the result is tagged `t` and ignored. */
export const kw = createCombinatorMaker("keyword");
/** Parses `n` but flags the result `ignored`: its text stays in the CST (so concatenating all leaves still reproduces the source) and it is dropped later, when the CST is lowered to an AST. */
export const ignored = createCombinatorMaker("ignored");
/** Invokes the named rule `r` from the grammar; the result is wrapped in a node typed `r`, unless the rule only delegated to another named rule. Extra combinators are arguments, for calling a parameterized rule. */
export const rule = createCombinatorMaker("rule");
/** Evaluates the argument combinator bound to the parameter `p` of the enclosing parameterized rule, in the scope where that argument was written. If `p` is unbound and a `defaultValue` is given, the default is evaluated instead, in the scope in effect at this reference; with no default, an unbound parameter is an error. */
export const param = createCombinatorMaker("param");
/** Evaluates the combinator bound to the dynamic parameter `p` by the nearest enclosing {@link bind}. Dynamic parameters are ambient context: any rule parsed within the bind's extent can read them without receiving them as arguments. If `p` is unbound and a `defaultValue` is given, the default is evaluated instead, in the scope in effect at this reference; with no default, an unbound dynamic parameter is an error. */
export const ambient = createCombinatorMaker("ambient");
/** Parses `body` with the dynamic parameter `p` bound to `value` for the body's dynamic extent (including any rules it calls, however deep). Inside `value`, `ambient(p)` still refers to the binding this one shadows, so a new value can extend the old one. */
export const bind = createCombinatorMaker("bind");
/** Matches all of `n` in order; the result is a flat node holding every child's result. */
export const seq = (...n: GrammarCombinator[]) => createCombinator("sequence", undefined, ...n);
/** Like `seq`, but the separator `s` is attempted between the items; separator results are marked ignored. */
export const ssep = (s: GrammarCombinator, ...n: GrammarCombinator[]) => createCombinator("sequence", s, ...n);
/** Tries every alternative and returns the first alternative that cut (whether or not it succeeded) or if none cut, the longest succeeding match (the first, on ties). */
export const alt = (...n: GrammarCombinator[]) => createCombinator("alternatives", false, ...n);
/** Always fails, but not a hard failure. */
export const no = () => createCombinator("alternatives", false);
/** Ordered choice: returns the first succeeding alternative, without trying later ones (a later alternative is tried only if every earlier one fails without cutting). */
export const altFirst = (...n: GrammarCombinator[]) => createCombinator("alternatives", true, ...n);
/** Matches `n` if it succeeds, otherwise succeeds empty -- unless `n` failed after a cut, in which case the failure propagates. */
export const opt = createCombinatorMaker("optional");
/** Repeats `n` greedily until it fails ordinarily; `r` = true requires at least one match, false allows zero. With several nodes the repetition cycles through them. */
export const rep = createCombinatorMaker("repeat");
/** Matches `n` separated by `j` (`n`, `n` `j` `n`, ...), keeping elements and separators in one flat result. `r2` requires at least two elements; `t` permits a trailing separator. */
export const joined = createCombinatorMaker("joined");
/** Conditional: evaluates `c` as a lookahead (consuming no input); matches `t` if it succeeds, `f` otherwise. */
export const if_ = createCombinatorMaker("if");
/** Parses `n` and tags the result with `t` (the visual kind used for syntax highlighting). */
export const tag = createCombinatorMaker("tag");
/** Cut: once matched, a later failure no longer falls back to sibling alternatives; `d` is how many enclosing choice levels the commitment spans. Produces an empty ignored node. */
export const cut = createCombinatorMaker("cut");
/** Asserts that `n` matches (`p` = true) or does not match (`p` = false) at the current position, consuming no input. */
export const lookahead = createCombinatorMaker("lookahead");
/** Parses `n` and fails if it matched without consuming any input. */
export const nonempty = createCombinatorMaker("nonempty");
/** Parses `n` and fails if the matched span contains a newline. */
export const sameline = createCombinatorMaker("sameline");
/** Always matches, consuming no input. */
export const nothing = createCombinatorMaker("nothing");
/** Always matches, consuming no input. */
export const yes = nothing;
/** Parses `n` speculatively: if `n` fails, any cut inside it is hidden, so the failure looks ordinary and enclosing alternatives can still fall back. */
export const try_ = createCombinatorMaker("try");
/** Always fails, with `m` naming what was expected. The failure carries an infinite cut, so no alternative or recovery is attempted past it. */
export const die = createCombinatorMaker("die");


/** Renders a combinator in a compact PEG-like notation, via its operation's `describe` in {@link opDefs}; for debugging grammars. */
export function describeCombinator(node: GrammarCombinator): string {
    // The lookup goes through the loose def type: indexing the table by a
    // not-yet-narrowed op cannot be typed precisely (the precise def for an
    // op is keyed by that op's own node shape).
    return (opDefs[node.op] as GrammarOpDef).describe(node);
}
