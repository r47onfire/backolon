import { isArray } from "lib0/array";
import { isString } from "lib0/function";
import { max } from "lib0/math";
import type {
    AltCombinator, AmbientCombinator, BindCombinator, CutCombinator, DieCombinator,
    EpsCombinator, Grammar, GrammarCombinator, GrammarOp, IfCombinator, IgnCombinator,
    JoinedCombinator, KwCombinator, LookaheadCombinator, NonemptyCombinator,
    OptCombinator, ParamCombinator, RepCombinator, RuleCombinator, SamelineCombinator,
    SeqCombinator, SsepCombinator, TagCombinator, TokCombinator, TryCombinator,
} from "./combinator";
import type { CSTNode } from "./cst";

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
 * One dynamic (ambient) binding: the combinator bound by a `bind`, the
 * lexical scope in effect where that bind was written (for any rule
 * parameters the value mentions), and the dynamic scope outside the bind
 * (what `ambient` references inside the value see -- in particular, the
 * binding this one shadows is still visible to the value itself, so a new
 * value can extend the one it replaces).
 */
export interface DynBinding {
    readonly node: GrammarCombinator,
    readonly locals: Locals,
    readonly dynamics: Dynamics
}

/**
 * The dynamic scope: a chain of {@link DynBinding}s, innermost first. Like
 * the lexical scope it is threaded through the parse as an immutable value,
 * so speculative branches cannot disturb each other's bindings. `key`
 * identifies this exact chain; while a chain is in effect its key is part
 * of every memo identity, so a result that depends on ambient context is
 * never reused under a different context.
 */
export interface DynFrame {
    readonly name: string,
    readonly binding: DynBinding,
    readonly next: Dynamics,
    readonly key: string
}
export type Dynamics = DynFrame | undefined;

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
    /** a single sub-combinator in the auxiliary role (separator, joiner, condition), hashed recursively with a different prime so it cannot be confused with a sequential child */
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
    recover(path: string, item: GrammarCombinator, i: number, fail: MatchFail, children: CSTNode[], locals: Locals, dynamics: Dynamics): number;
    recoverChild(path: string, child: GrammarCombinator, i: number, fail: MatchFail, children: CSTNode[], locals: Locals, dynamics: Dynamics): number | null;
    /** Cut depth of the innermost open rule frame (0 if there is none). */
    cutDepth(): number;
    /** Marks the innermost frame's cut as consumed by the current alternative. */
    consumeCut(): void;
    /** How many open frames currently hold a cut. */
    committedDepth(): number;
    /** A snapshot of the cut stack's depths, for speculative parses. */
    snapshotCuts(): number[];
    /** Restores a snapshot taken with {@link OpContext.snapshotCuts}. */
    restoreCuts(saved: readonly number[]): void;
    /** Pushes a fresh cut frame for a rule invocation. */
    pushCutFrame(): void;
    /** Pops the innermost cut frame and returns the depth it reached. */
    popCutFrame(): number;
    /** Records a cut of the given depth in the innermost frame. */
    applyCut(depth: number): void;
    /** True if an enclosing construct has committed (cut) without finishing yet. */
    inCommittedScope(): boolean;
    /** A hash of a combinator tree with its parameter references resolved in the given scopes. */
    hashResolved(node: GrammarCombinator, locals: Locals, dynamics: Dynamics, path: string): number;
    /** The memo path naming a parameterized rule instance (rule name plus resolved argument hashes). */
    instancePath(name: string, args: readonly GrammarCombinator[], locals: Locals, dynamics: Dynamics, path: string): string;
}

/**
 * The definition of one grammar operation: how its nodes are created
 * (`create`, also exported as the operation's factory function), how they
 * are parsed (`call`), and which of their fields feed the combinator hash
 * (`hashFields`). Keeping all three together in this table is what lets
 * the parser's dispatcher, the hash function, and future traversals stay
 * generic over operations.
 */
export interface GrammarOpDef {
    create: (...args: any[]) => GrammarCombinator;
    call: (ctx: OpContext, node: any, path: string, i: number, locals: Locals, dynamics: Dynamics) => CSTNode | MatchFail;
    hashFields: readonly (readonly [field: string, action: MixAction])[];
}

// ---------------------------------------------------------------------------
// tok

/** Matches the literal string `p` exactly; produces a leaf holding that text. */
export const lit = (p: string): TokCombinator => ({ op: "tok", pattern: p });
/** Matches the regex `p` anchored at the current position (the engine adds the sticky flag); produces a leaf holding the matched text. The pattern is stored as `[source, flags]` to keep combinators plain data. */
export const regex = (p: RegExp): TokCombinator => ({ op: "tok", pattern: [p.source, p.flags] });

const tokDef: GrammarOpDef = {
    create: (pattern: string | [string, string]): TokCombinator => ({ op: "tok", pattern }),
    call: (ctx, node: TokCombinator, path, i) => {
        const pattern = node.pattern;
        if (isArray(pattern)) {
            const re = new RegExp(pattern[0], pattern[1] + "y");
            re.lastIndex = i;
            const match = re.exec(ctx.text);
            return match ? { text: match[0], start: i, end: i + match[0].length } : new MatchFail(i, 0, node);
        }
        return ctx.text.startsWith(pattern, i) ? { text: pattern, start: i, end: i + pattern.length } : new MatchFail(i, 0, node);
    },
    hashFields: [["pattern", MixAction.Text]],
};

// ---------------------------------------------------------------------------
// kw

/** Matches any one of the given options between regex \b separators; the result is tagged `t` and ignored. */
export const kw = (t: string, ...options: string[]): KwCombinator => ({ op: "kw", tag: t, options });

const kwDef: GrammarOpDef = {
    create: kw,
    call: (ctx, node: KwCombinator, path, i) => {
        const re = new RegExp("\\b(" + node.options.map(RegExp.escape).join("|") + ")\\b", "y");
        re.lastIndex = i;
        const match = re.exec(ctx.text);
        return match ? { text: match[0], tag: node.tag, start: i, end: i + match[0].length, ignored: true } : new MatchFail(i, 0, node);
    },
    hashFields: [["tag", MixAction.String], ["options", MixAction.StringArray]],
};

// ---------------------------------------------------------------------------
// ign

/** Parses `n` but flags the result `ignored`: its text stays in the CST (so concatenating all leaves still reproduces the source) and it is dropped later, when the CST is lowered to an AST. */
export const ignored = (n: GrammarCombinator): IgnCombinator => ({ op: "ign", child: n });

const ignDef: GrammarOpDef = {
    create: ignored,
    call: (ctx, node: IgnCombinator, path, i, locals, dynamics) => {
        const cst = ctx.applyRule(path + "/", node.child, i, locals, dynamics);
        return cst instanceof MatchFail ? cst : { ignored: true, start: cst.start, end: cst.end, children: [cst] };
    },
    hashFields: [["child", MixAction.Child]],
};

// ---------------------------------------------------------------------------
// rule

/** Invokes the named rule `r` from the grammar; the result is wrapped in a node typed `r`, unless the rule only delegated to another named rule. Extra combinators are arguments, for calling a parameterized rule. */
export const rule = (r: string, ...args: GrammarCombinator[]): RuleCombinator => args.length ? { op: "rule", name: r, args } : { op: "rule", name: r };

const ruleDef: GrammarOpDef = {
    create: rule,
    call: (ctx, node: RuleCombinator, path, i, locals, dynamics) => {
        const name = node.name;
        const entry = ctx.grammar[name];
        if (!entry) throw new Error("unknown named rule " + name + " at " + path);
        const args = node.args ?? [];
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
            bodyPath = ctx.instancePath(name, args, locals, dynamics, path);
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
        if (cst.text === undefined && isString(cst.type)) return cst;
        return { type: name, start: cst.start, end: cst.end, children: [cst] };
    },
    hashFields: [["name", MixAction.String], ["args", MixAction.Children]],
};

// ---------------------------------------------------------------------------
// param

/** Evaluates the argument combinator bound to the parameter `p` of the enclosing parameterized rule, in the scope where that argument was written. If `p` is unbound and a `defaultValue` is given, the default is evaluated instead, in the scope in effect at this reference; with no default, an unbound parameter is an error. */
export const param = (p: string, defaultValue?: GrammarCombinator): ParamCombinator => defaultValue ? { op: "param", name: p, default: defaultValue } : { op: "param", name: p };

const paramDef: GrammarOpDef = {
    create: param,
    call: (ctx, node: ParamCombinator, path, i, locals, dynamics) => {
        const name = node.name;
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
        if (node.default) return ctx.applyRule(path + "$" + name, node.default, i, locals, dynamics);
        throw new Error("unbound rule parameter " + name + " at " + path);
    },
    hashFields: [["name", MixAction.String], ["default", MixAction.Child]],
};

// ---------------------------------------------------------------------------
// ambient

/** Evaluates the combinator bound to the dynamic parameter `p` by the nearest enclosing {@link bind}. Dynamic parameters are ambient context: any rule parsed within the bind's extent can read them without receiving them as arguments. If `p` is unbound and a `defaultValue` is given, the default is evaluated instead, in the scope in effect at this reference; with no default, an unbound dynamic parameter is an error. */
export const ambient = (p: string, defaultValue?: GrammarCombinator): AmbientCombinator => defaultValue ? { op: "ambient", name: p, default: defaultValue } : { op: "ambient", name: p };

const ambientDef: GrammarOpDef = {
    create: ambient,
    call: (ctx, node: AmbientCombinator, path, i, locals, dynamics) => {
        const name = node.name;
        for (var dyn = dynamics; dyn; dyn = dyn.next) {
            // As with param, the value gets its own memo path -- and the
            // path names the binding's frame key, because the same
            // reference under different bindings must not share a memo
            // entry even though the value is evaluated in the scope
            // outside the bind. It is evaluated with the lexical scope of
            // the bind that supplied it, and the dynamic scope outside
            // that bind.
            if (dyn.name === name) return ctx.applyRule(path + "$@" + name + "#" + dyn.key, dyn.binding.node, i, dyn.binding.locals, dyn.binding.dynamics);
        }
        if (node.default) return ctx.applyRule(path + "$@" + name, node.default, i, locals, dynamics);
        throw new Error("unbound dynamic parameter " + name + " at " + path);
    },
    hashFields: [["name", MixAction.String], ["default", MixAction.Child]],
};

// ---------------------------------------------------------------------------
// bind

/** Parses `body` with the dynamic parameter `p` bound to `value` for the body's dynamic extent (including any rules it calls, however deep). Inside `value`, `ambient(p)` still refers to the binding this one shadows, so a new value can extend the old one. */
export const bind = (p: string, value: GrammarCombinator, body: GrammarCombinator): BindCombinator => ({ op: "bind", name: p, value, body });

const bindDef: GrammarOpDef = {
    create: bind,
    call: (ctx, node: BindCombinator, path, i, locals, dynamics) => {
        const frame: DynFrame = {
            name: node.name,
            binding: { node: node.value, locals, dynamics },
            next: dynamics,
            key: (dynamics ? dynamics.key + "/" : "") + node.name + "#" + ctx.hashResolved(node.value, locals, dynamics, path).toString(36),
        };
        return ctx.applyRule(path + "/b", node.body, i, locals, frame);
    },
    hashFields: [["name", MixAction.String], ["value", MixAction.Child], ["body", MixAction.Child]],
};

// ---------------------------------------------------------------------------
// seq / ssep

/** Matches all of `n` in order; the result is a flat node holding every child's result. */
export const seq = (...n: GrammarCombinator[]): SeqCombinator => ({ op: "seq", items: n });
/** Like `seq`, but the separator `s` is attempted before, between, and after the items; separator results are marked ignored. */
export const ssep = (s: GrammarCombinator, ...n: GrammarCombinator[]): SsepCombinator => ({ op: "ssep", items: n, separator: s });

const callSequence = (ctx: OpContext, node: SeqCombinator | SsepCombinator, path: string, i: number, locals: Locals, dynamics: Dynamics): CSTNode | MatchFail => {
    const children: CSTNode[] = [];
    const start = i;
    const items = node.items, len = items.length;
    const sep = () => {
        if (node.op !== "ssep") return;
        const sepThing = ctx.applyRule(path + "/s", node.separator, i, locals, dynamics);
        if (sepThing instanceof MatchFail) {
            children.push({ ignored: true, start: i, end: i });
        } else {
            children.push({ ignored: true, start: sepThing.start, end: sepThing.end, children: [sepThing] });
            i = sepThing.end;
        }
    };
    const currentCut = ctx.cutDepth();
    for (var j = 0; j < len; j++) {
        sep();
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
    sep();
    return { start, end: i, children };
};

const seqDef: GrammarOpDef = {
    create: seq,
    call: callSequence,
    hashFields: [["items", MixAction.Children]],
};

const ssepDef: GrammarOpDef = {
    create: ssep,
    call: callSequence,
    hashFields: [["items", MixAction.Children], ["separator", MixAction.AuxChild]],
};

// ---------------------------------------------------------------------------
// alt

/** Tries every alternative and returns the first alternative that cut (whether or not it succeeded) or if none cut, the longest succeeding match (the first, on ties). */
export const alt = (...n: GrammarCombinator[]): AltCombinator => ({ op: "alt", options: n });

const altDef: GrammarOpDef = {
    create: alt,
    call: (ctx, node: AltCombinator, path, i, locals, dynamics) => {
        const items = node.options, len = items.length;
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
            if (ctx.cutDepth() > depthBefore) return thisMatch;
            options.push(thisMatch);
        }
        return options.length < 1 ? (furthestFail ?? new MatchFail(i, 0, node)) : options.reduce((a, b) => b.end > a.end ? b : a);
    },
    hashFields: [["options", MixAction.Children]],
};

// ---------------------------------------------------------------------------
// opt

/** Matches `n` if it succeeds, otherwise succeeds empty -- unless `n` failed after a cut, in which case the failure propagates. */
export const opt = (n: GrammarCombinator): OptCombinator => ({ op: "opt", child: n });

const optDef: GrammarOpDef = {
    create: opt,
    call: (ctx, node: OptCombinator, path, i, locals, dynamics) => {
        const cst = ctx.applyRule(path + "/", node.child, i, locals, dynamics);
        // don't swallow a cut fail
        return cst instanceof MatchFail ? (cst.cut > 0 ? cst : { start: i, end: i }) : cst;
    },
    hashFields: [["child", MixAction.Child]],
};

// ---------------------------------------------------------------------------
// rep

/** Repeats `n` greedily until it fails ordinarily; `r` = true requires at least one match, false allows zero. With several nodes the repetition cycles through them. */
export const rep = (r: boolean, n: GrammarCombinator): RepCombinator => ({ op: "rep", items: [n], required: r });

const repDef: GrammarOpDef = {
    create: rep,
    call: (ctx, node: RepCombinator, path, i, locals, dynamics) => {
        const start = i;
        const children: CSTNode[] = [];
        const nodes = node.items, len = nodes.length;
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
                    if (node.required && count < 1) return thisMatch;
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
};

// ---------------------------------------------------------------------------
// joined

/** Matches `n` separated by `j` (`n`, `n` j `n`, ...), keeping elements and separators in one flat result. `r2` requires at least two elements; `t` permits a trailing separator. */
export const joined = (j: GrammarCombinator, n: GrammarCombinator, r2: boolean, t: boolean): JoinedCombinator => ({ op: "joined", joiner: j, element: n, require2: r2, trailing: t });

const joinedDef: GrammarOpDef = {
    create: joined,
    call: (ctx, node: JoinedCombinator, path, i, locals, dynamics) => {
        const start = i;
        const children: CSTNode[] = [];
        const elemRule = node.element, sepRule = node.joiner;
        const require2 = node.require2, trailing = node.trailing;
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
};

// ---------------------------------------------------------------------------
// if

/** Conditional: evaluates `c` as a lookahead (consuming no input); matches `t` if it succeeds, `f` otherwise. */
export const if_ = (c: GrammarCombinator, t: GrammarCombinator, f: GrammarCombinator): IfCombinator => ({ op: "if", condition: c, if_true: t, if_false: f });

const ifDef: GrammarOpDef = {
    create: if_,
    call: (ctx, node: IfCombinator, path, i, locals, dynamics) =>
        ctx.applyRule(path + "/c", node.condition, i, locals, dynamics) instanceof MatchFail
            ? ctx.applyRule(path + "/f", node.if_false, i, locals, dynamics)
            : ctx.applyRule(path + "/t", node.if_true, i, locals, dynamics),
    hashFields: [["condition", MixAction.AuxChild], ["if_true", MixAction.Child], ["if_false", MixAction.Child]],
};

// ---------------------------------------------------------------------------
// tag

/** Parses `n` and tags the result with `t` (the visual kind used for syntax highlighting). */
export const tag = (t: string, n: GrammarCombinator): TagCombinator => ({ op: "tag", tag: t, child: n });

const tagDef: GrammarOpDef = {
    create: tag,
    call: (ctx, node: TagCombinator, path, i, locals, dynamics) => {
        const cst = ctx.applyRule(path + "/", node.child, i, locals, dynamics);
        return cst instanceof MatchFail ? cst : { tag: node.tag, start: cst.start, end: cst.end, children: [cst] };
    },
    hashFields: [["tag", MixAction.String], ["child", MixAction.Child]],
};

// ---------------------------------------------------------------------------
// cut

/** Cut: once matched, a later failure no longer falls back to sibling alternatives; `d` is how many enclosing choice levels the commitment spans. Produces an empty ignored node. */
export const cut = (d = 1): CutCombinator => ({ op: "cut", depth: d });

const cutDef: GrammarOpDef = {
    create: cut,
    call: (ctx, node: CutCombinator, path, i) => {
        ctx.applyCut(node.depth);
        return { ignored: true, start: i, end: i };
    },
    hashFields: [["depth", MixAction.Number]],
};

// ---------------------------------------------------------------------------
// lookahead

/** Asserts that `n` matches (`p` = true) or does not match (`p` = false) at the current position, consuming no input. */
export const lookahead = (p: boolean, n: GrammarCombinator): LookaheadCombinator => ({ op: "lookahead", positive: p, child: n });

const lookaheadDef: GrammarOpDef = {
    create: lookahead,
    call: (ctx, node: LookaheadCombinator, path, i, locals, dynamics) => {
        const cst = ctx.applyRule(path + "/?", node.child, i, locals, dynamics);
        return (cst instanceof MatchFail) === !node.positive ? { ignored: true, start: i, end: i } : new MatchFail(i, 0, node);
    },
    hashFields: [["positive", MixAction.Boolean], ["child", MixAction.Child]],
};

// ---------------------------------------------------------------------------
// nonempty / sameline

/** Parses `n` and fails if it matched without consuming any input. */
export const nonempty = (n: GrammarCombinator): NonemptyCombinator => ({ op: "nonempty", child: n });

const nonemptyDef: GrammarOpDef = {
    create: nonempty,
    call: (ctx, node: NonemptyCombinator, path, i, locals, dynamics) => {
        const cst = ctx.applyRule(path + "/", node.child, i, locals, dynamics);
        return cst instanceof MatchFail ? cst : cst.end === i ? new MatchFail(i, 0, node) : cst;
    },
    hashFields: [["child", MixAction.Child]],
};

/** Parses `n` and fails if the matched span contains a newline. */
export const sameline = (n: GrammarCombinator): SamelineCombinator => ({ op: "sameline", child: n });

const samelineDef: GrammarOpDef = {
    create: sameline,
    call: (ctx, node: SamelineCombinator, path, i, locals, dynamics) => {
        const cst = ctx.applyRule(path + "/", node.child, i, locals, dynamics);
        return cst instanceof MatchFail ? cst : ctx.text.slice(cst.start, cst.end).indexOf("\n") >= 0 ? new MatchFail(i, 0, node) : cst;
    },
    hashFields: [["child", MixAction.Child]],
};

// ---------------------------------------------------------------------------
// eps

/** Always matches, consuming no input. */
export const eps = (): EpsCombinator => ({ op: "eps" });

const epsDef: GrammarOpDef = {
    create: eps,
    call: (ctx, node: EpsCombinator, path, i) => ({ start: i, end: i }),
    hashFields: [],
};

// ---------------------------------------------------------------------------
// try

/** Parses `n` speculatively: if `n` fails, any cut inside it is hidden, so the failure looks ordinary and enclosing alternatives can still fall back. */
export const try_ = (n: GrammarCombinator): TryCombinator => ({ op: "try", child: n });

const tryDef: GrammarOpDef = {
    create: try_,
    call: (ctx, node: TryCombinator, path, i, locals, dynamics) => {
        // Speculative parse: if node fails, hide the cuts
        const savedCuts = ctx.snapshotCuts();
        const cst = ctx.applyRule(path + "/", node.child, i, locals, dynamics);
        if (cst instanceof MatchFail) {
            ctx.restoreCuts(savedCuts);
            return new MatchFail(cst.i, 0, cst.expected);
        }
        return cst;
    },
    hashFields: [["child", MixAction.Child]],
};

// ---------------------------------------------------------------------------
// die

/** Always fails, with `m` naming what was expected. The failure carries an infinite cut, so no alternative or recovery is attempted past it. */
export const die = (m: string): DieCombinator => ({ op: "die", message: m });

const dieDef: GrammarOpDef = {
    create: die,
    call: (ctx, node: DieCombinator, path, i) => new MatchFail(i, Infinity, node),
    hashFields: [["message", MixAction.String]],
};

// ---------------------------------------------------------------------------

/** The definition of every grammar operation, keyed by its `op`. */
export const opDefs: Record<GrammarOp, GrammarOpDef> = {
    tok: tokDef,
    kw: kwDef,
    ign: ignDef,
    rule: ruleDef,
    param: paramDef,
    ambient: ambientDef,
    bind: bindDef,
    seq: seqDef,
    ssep: ssepDef,
    joined: joinedDef,
    alt: altDef,
    opt: optDef,
    rep: repDef,
    if: ifDef,
    tag: tagDef,
    cut: cutDef,
    lookahead: lookaheadDef,
    nonempty: nonemptyDef,
    sameline: samelineDef,
    eps: epsDef,
    try: tryDef,
    die: dieDef,
};
