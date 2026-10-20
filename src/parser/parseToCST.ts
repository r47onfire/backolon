import { javaHash } from "@r47onfire/game-math";
import { isArray, last } from "lib0/array";
import { isString } from "lib0/function";
import { imul, max } from "lib0/math";
import { Grammar, GrammarCombinator, hashCombinator, rule } from "./combinator";
import { CSTNode } from "./cst";

/**
 * Memoization key: `<start index>#<grammar path>`. The path of a nested
 * combinator is built from rule names plus `/`-separated child indices, so
 * the same combinator reached through different rules memoizes separately.
 */
export type MemoLoc = `${number}#${string}`;
const toMemoLoc = (path: string, index: number): MemoLoc => `${index}#${path}`;

/**
 * Warth-style left-recursion state for one input position: `path` is the rule
 * whose seed is being grown, `involved` is the set of rules that participated
 * in the recursive cycle, and `eval` is the subset still to re-evaluate in
 * the current growth pass.
 */
interface Head {
    path: string,
    involved: Set<string>,
    eval: Set<string>
}

/**
 * One in-progress invocation on the left-recursion stack (a linked list via
 * `next`). `seed` starts as a failure and is replaced by successively longer
 * matches while the left recursion grows; `head` is set once this invocation
 * turns out to be part of a recursive cycle.
 */
class LR {
    constructor(
        readonly path: string,
        public seed: CSTNode | MatchFail,
        public head: Head | undefined,
        readonly next: LR | undefined
    ) { }
}

/**
 * A failed match. `i` is the index where the failure occurred (used for
 * error reporting), `cut` is the remaining cut depth (Infinity for `die`),
 * and `expected` is the combinator that failed to match.
 */
class MatchFail {
    constructor(readonly i: number, readonly cut: number, readonly expected: GrammarCombinator) { }
}

// Exported as types only, so they can be named in public signatures (and
// documentation) without exposing their constructors as public API;
// only the parser itself creates them.
export type { Head, LR, MatchFail };

/**
 * One argument binding of a parameterized rule invocation: the argument
 * combinator, plus the parameter scope in effect where the argument was
 * written, so that evaluating it later (via the `param` op) resolves any
 * parameters it mentions in the call site's scope, not the callee's.
 */
interface ParamBinding {
    readonly g: GrammarCombinator,
    readonly locals: Locals
}

/**
 * A parameter scope: the bindings of one parameterized rule invocation,
 * chained to the enclosing scope. Scopes are threaded through the parse as
 * immutable values, so speculative branches (alternatives, lookaheads,
 * recovery probes) can never disturb each other's bindings.
 */
interface ParamFrame {
    readonly bindings: Readonly<Record<string, ParamBinding>>,
    readonly next: Locals
}
type Locals = ParamFrame | undefined;

/**
 * One dynamic (ambient) binding: the combinator bound by a `bind`, the
 * lexical scope in effect where that bind was written (for any rule
 * parameters the value mentions), and the dynamic scope outside the bind
 * (what `ambient` references inside the value see -- in particular, the
 * binding this one shadows is still visible to the value itself, so a new
 * value can extend the one it replaces).
 */
interface DynBinding {
    readonly g: GrammarCombinator,
    readonly locals: Locals,
    readonly dynamics: Dynamics
}

/**
 * The dynamic scope: a chain of {@link DynBinding}s, innermost first. Like
 * the lexical scope it is threaded through the parse as an immutable value,
 * so speculative branches cannot disturb each other's bindings. `key`
 * identifies this exact chain; while a chain is in effect its key is part of
 * every memo identity, so a result that depends on ambient context is never
 * reused under a different context.
 */
interface DynFrame {
    readonly name: string,
    readonly binding: DynBinding,
    readonly next: Dynamics,
    readonly key: string
}
type Dynamics = DynFrame | undefined;

/**
 * A hash of a combinator tree with its parameter references resolved:
 * `param` nodes contribute the hash of the argument they name (resolved in
 * the lexical scope), `ambient` nodes the hash of the dynamic binding they
 * name (resolved in the dynamic scope captured by that binding, so a
 * binding's value never depends on itself), and `bind` nodes hash their
 * body under the dynamic scope the bind creates. Nothing is cached: the
 * result depends on the scopes, not just the tree.
 */
const hashResolved = (g: GrammarCombinator, locals: Locals, dynamics: Dynamics, path: string): number => {
    if (g.op === "param") {
        for (var frame = locals; frame; frame = frame.next) {
            const binding = frame.bindings[g.v as string];
            if (binding) return hashResolved(binding.g, binding.locals, dynamics, path);
        }
        throw new Error("unbound rule parameter " + g.v + " at " + path);
    }
    if (g.op === "ambient") {
        for (var dyn = dynamics; dyn; dyn = dyn.next) {
            if (dyn.name === g.v) return hashResolved(dyn.binding.g, dyn.binding.locals, dyn.binding.dynamics, path);
        }
        throw new Error("unbound dynamic parameter " + g.v + " at " + path);
    }
    if (g.op !== "rule" && g.op !== "bind" && !g.c && !g.j) return hashCombinator(g);
    var h = 0x811c9dc5;
    const mixString = (s: string, p: number) => h = imul(h + javaHash(s), p);
    mixString(g.op, 31);
    const v = g.v;
    if (typeof v === "string") mixString(v, 31);
    else if (typeof v === "number") h = (imul(h, 31) + v) >>> 0;
    else if (isArray(v)) for (var s of v) mixString(s, 31);
    if (g.f !== undefined) mixString(g.f, 31);
    if (g.op === "bind") {
        const inner: Dynamics = { name: v as string, binding: { g: g.j!, locals, dynamics }, next: dynamics, key: "" };
        h = (imul(h, 31) + hashResolved(g.j!, locals, dynamics, path)) >>> 0;
        h = (imul(h, 31) + hashResolved(g.c![0]!, locals, inner, path)) >>> 0;
    } else {
        if (g.c) for (var child of g.c) h = (imul(h, 31) + hashResolved(child, locals, dynamics, path)) >>> 0;
        if (g.j) h = (imul(h, 37) + hashResolved(g.j, locals, dynamics, path)) >>> 0;
    }
    return h >>> 0;
};

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
 * The memo table for a parse: results (a CST node, a failure, or an
 * in-progress LR) by `MemoLoc`. A caller may pass one in to reuse it across
 * parses, but it must be cleared whenever the grammar changes.
 */
export type Memo = Record<MemoLoc, CSTNode | MatchFail | LR>;

/**
 * Parse text into a CST. The CST may contain error nodes if there were syntax errors.
 */
export const parseToCST = (text: string, startIndex: number, startRule: string, grammar: Grammar, recoverNodeType: string, errorType = "BAD", memo: Memo = {}): CSTNode => {
    const heads: (Head | undefined)[] = [];
    var lrStack: LR | undefined;
    const cutStack: [number][] = [];
    /** Cut depth of the innermost open rule frame (0 if there is none). */
    const cutDepth = () => last(cutStack)?.[0] ?? 0;
    /** Marks the innermost frame's cut as consumed by the current alternative. */
    const consumeCut = () => { if (cutStack.length) last(cutStack)![0] = 0; };
    const errorNode = (start: number, end: number, expected: GrammarCombinator): CSTNode => ({ type: errorType, start, end, text: text.slice(start, end), errorExpected: expected });
    /**
     * True if an enclosing construct has committed (cut) without finishing yet.
     * Resyncs inside such a scope must stay local to it!
     */
    const inCommittedScope = () => cutStack.some(f => f[0] > 0);
    /**
     * Probe `node` at index `j`, restoring cut/LR state afterwards (probes are
     * speculative and don't log commits). Null if no progress was made
     */
    const probeAt = (path: string, node: GrammarCombinator, j: number, locals: Locals, dynamics: Dynamics): CSTNode | null => {
        const savedCuts = cutStack.map(frame => frame[0]);
        const savedLR = lrStack;
        const probe = applyRule(path, node, j, locals, dynamics);
        // restore cuts and LR stack
        for (var k = 0; k < savedCuts.length; k++) cutStack[k]![0] = savedCuts[k]!;
        cutStack.length = savedCuts.length;
        lrStack = savedLR;
        if (probe instanceof MatchFail) return null;
        if (probe.end <= j) return null;
        return probe;
    };
    /**
     * Panic-mode recovery: scan forward for the next index where `item` matches,
     * turning all skipped source into a single error node. Returns the index to
     * continue parsing from. If nothing works, emits an error up to end of input.
     *
     * Only used when NOT inside a committed scope. Inside one, the enclosing
     * construct owns resynchronization (seq_sep rescans for its failed child;
     * repeats emit a minimal error), so no bracket guessing is needed.
     */
    const recover = (path: string, item: GrammarCombinator, i: number, fail: MatchFail, children: CSTNode[], locals: Locals, dynamics: Dynamics): number => {
        if (i >= text.length) return i;
        for (var j = max(fail.i, i + 1); j <= text.length; j++) {
            const probe = probeAt(path, item, j, locals, dynamics);
            if (!probe) continue;
            children.push(errorNode(i, j, fail.expected), probe);
            return probe.end;
        }
        children.push(errorNode(i, text.length, fail.expected));
        return text.length;
    };
    /**
     * Local recovery for a sequence with a fail after a cut.
     * Resynchronize to the nearest position where that child matches, keeping the committed prefix intact.
     * Returns the index to continue from, or null if the child never matches (give up and propagate the fail).
     *
     * The skipped text becomes a BAD node that carries the recovered child in its `recovered` field.
     * This keeps the sequence's fixed arity while still allowing the parse to recover later
     */
    const recoverChild = (path: string, child: GrammarCombinator, i: number, fail: MatchFail, children: CSTNode[], locals: Locals, dynamics: Dynamics): number | null => {
        for (var j = i + 1; j <= text.length; j++) {
            const probe = probeAt(path, child, j, locals, dynamics);
            if (!probe) continue;
            children.push({
                type: recoverNodeType,
                start: i,
                end: probe.end,
                children: [errorNode(i, j, fail.expected), probe],
            });
            return probe.end;
        }
        return null;
    };
    /**
     * Do the actual logic for the grammar node's operation.
     */
    const callRule = (path: string, g: GrammarCombinator, i: number, locals: Locals, dynamics: Dynamics): CSTNode | MatchFail => {
        const badflag = (): never => {
            throw new Error("bad flag for " + op + ": " + g.f);
        };
        const op = g?.op;
        switch (op) {
            case "tok": {
                const p = g.v as string | [string, string];
                if (isArray(p)) {
                    const re = new RegExp(p[0], p[1] + "y");
                    re.lastIndex = i;
                    const match = re.exec(text);
                    return match ? { text: match[0], start: i, end: i + match[0].length } : new MatchFail(i, 0, g);
                } else {
                    return text.startsWith(p, i) ? { text: p, start: i, end: i + p.length } : new MatchFail(i, 0, g);
                }
            }
            case "kw": {
                const p = g.v as string[];
                const re = new RegExp("\\b(" + p.map(RegExp.escape).join("|") + ")\\b", "y");
                re.lastIndex = i;
                const match = re.exec(text);
                return match ? { text: match[0], tag: g.f, start: i, end: i + match[0].length, ignored: true } : new MatchFail(i, 0, g);
            }
            case "ign": {
                const cst = applyRule(path + "/", g.c![0]!, i, locals, dynamics);
                return cst instanceof MatchFail ? cst : { ignored: true, start: cst.start, end: cst.end, children: [cst] };
            }
            case "rule": {
                const name = g.v as string;
                const entry = grammar[name];
                if (!entry) throw new Error("unknown named rule " + name + " at " + path);
                const args = g.c ?? [];
                var body: GrammarCombinator, bodyPath = name, bodyLocals = locals;
                if (isArray(entry)) {
                    // Parameterized rule: bind the arguments (all required, no
                    // defaults), each capturing the scope in effect at this
                    // call site, and evaluate the body under a memo path that
                    // names the instance (the rule name plus the hashes of its
                    // argument combinators), so that different instances of
                    // the same rule memoize separately.
                    const { 0: params, 1: ruleBody } = entry;
                    if (args.length !== params.length) throw new Error("rule " + name + " takes " + params.length + " argument(s) but got " + args.length + " at " + path);
                    const bindings: Record<string, ParamBinding> = {};
                    for (var k = 0; k < params.length; k++) bindings[params[k]!] = { g: args[k]!, locals };
                    body = ruleBody;
                    bodyPath = instancePath(name, args, locals, dynamics, path);
                    bodyLocals = { bindings, next: locals };
                } else {
                    if (args.length) throw new Error("rule " + name + " takes no arguments at " + path);
                    body = entry as GrammarCombinator;
                }
                cutStack.push([0]);
                const cst = applyRule(bodyPath, body, i, bodyLocals, dynamics);
                const frameDepth = cutDepth();
                cutStack.pop();
                if (cst instanceof MatchFail) {
                    const d = max(cst.cut, frameDepth);
                    return d === cst.cut ? cst : new MatchFail(cst.i, d, cst.expected);
                }
                // Don't nest when the rule only delegated to another named rule
                if (cst.text === undefined && isString(cst.type)) return cst;
                return { type: name, start: cst.start, end: cst.end, children: [cst] };
            }
            case "param": {
                const name = g.v as string;
                for (var scope = locals; scope; scope = scope.next) {
                    const binding = scope.bindings[name];
                    // Evaluate the argument under its own memo path: the memo
                    // is keyed by path alone, so reusing this reference's path
                    // would collide with the param op's own in-progress entry.
                    // The argument's own parameters resolve in the scope it
                    // captured, but any dynamic parameters it mentions resolve
                    // in the ambient context in effect here, at its use.
                    if (binding) return applyRule(path + "$" + name, binding.g, i, binding.locals, dynamics);
                }
                throw new Error("unbound rule parameter " + name + " at " + path);
            }
            case "ambient": {
                const name = g.v as string;
                for (var dyn = dynamics; dyn; dyn = dyn.next) {
                    // As with param, the value gets its own memo path -- and
                    // the path names the binding's frame key, because the
                    // same reference under different bindings must not share
                    // a memo entry even though the value is evaluated in the
                    // scope outside the bind. It is evaluated with the
                    // lexical scope of the bind that supplied it, and the
                    // dynamic scope outside that bind.
                    if (dyn.name === name) return applyRule(path + "$@" + name + "#" + dyn.key, dyn.binding.g, i, dyn.binding.locals, dyn.binding.dynamics);
                }
                throw new Error("unbound dynamic parameter " + name + " at " + path);
            }
            case "bind": {
                const name = g.v as string;
                const frame: DynFrame = {
                    name,
                    binding: { g: g.j!, locals, dynamics },
                    next: dynamics,
                    key: (dynamics ? dynamics.key + "/" : "") + name + "#" + hashResolved(g.j!, locals, dynamics, path).toString(36),
                };
                return applyRule(path + "/b", g.c![0]!, i, locals, frame);
            }
            case "tag": {
                const cst = applyRule(path + "/", g.c![0]!, i, locals, dynamics);
                return cst instanceof MatchFail ? cst : { tag: g.f, start: cst.start, end: cst.end, children: [cst] };
            }
            case "seq":
            case "ssep": {
                const children: CSTNode[] = [];
                const start = i;
                const items = g.c!, len = items.length;
                const sep = () => {
                    if (op !== "ssep") return;
                    const sepThing = applyRule(path + "/s", g.j!, i, locals, dynamics);
                    if (sepThing instanceof MatchFail) {
                        children.push({ ignored: true, start: i, end: i });
                    } else {
                        children.push({ ignored: true, start: sepThing.start, end: sepThing.end, children: [sepThing] });
                        i = sepThing.end;
                    }
                }
                const currentCutFrame = last(cutStack), currentCut = currentCutFrame?.[0];
                for (var j = 0; j < len; j++) {
                    sep();
                    const child = items[j]!;
                    const thisMatch = applyRule(path + "/" + j, child, i, locals, dynamics);
                    if (thisMatch instanceof MatchFail) {
                        if (thisMatch.cut === Infinity) return thisMatch;
                        if ((currentCutFrame?.[0] ?? 0) > currentCut) {
                            // we did another cut inside
                            // resync to the failed child (without breaking the outer grammar node)
                            var depth = 0;
                            for (var frame of cutStack) if (frame[0] > 0) depth++;
                            if (depth > 1) return thisMatch;
                            const resumed = recoverChild(path + "/" + j, child, i, thisMatch, children, locals, dynamics);
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
            }
            case "alt": {
                const items = g.c!, len = items.length;
                const options: CSTNode[] = [];
                var furthestFail: MatchFail | undefined;
                for (var j = 0; j < len; j++) {
                    const depthBefore = cutDepth();
                    const thisMatch = applyRule(path + "/" + j, items[j]!, i, locals, dynamics);
                    if (thisMatch instanceof MatchFail) {
                        const childCut = thisMatch.cut;
                        const d = max(thisMatch.cut, cutDepth());
                        if (d === 0) {
                            // track the furthest failure for better error messages
                            if (!furthestFail || thisMatch.i > furthestFail.i) furthestFail = thisMatch;
                            continue;
                        }
                        consumeCut();
                        // propagate the child's cut depth unchanged; only decrement if the cut was from this level
                        const newCut = childCut > 0 ? childCut : d - 1;
                        return new MatchFail(thisMatch.i, newCut, thisMatch.expected);
                    }
                    // A cut inside a successful alternative commits the choice:
                    // return it now instead of letting a later, longer alternative win.
                    if (cutDepth() > depthBefore) return thisMatch;
                    options.push(thisMatch);
                }
                return options.length < 1 ? (furthestFail ?? new MatchFail(i, 0, g)) : options.reduce((a, b) => b.end > a.end ? b : a);
            }
            case "opt": {
                const cst = applyRule(path + "/", g.c![0]!, i, locals, dynamics);
                // don't swallow a cut fail
                return cst instanceof MatchFail ? (cst.cut > 0 ? cst : { start: i, end: i }) : cst;
            }
            case "rep": {
                const start = i;
                const children: CSTNode[] = [];
                if (g.f !== "r" && g.f !== "o") badflag();
                const nodes = g.c!, len = nodes.length;
                if (len > 0) {
                    for (var count = 0; ; count++) {
                        if (i >= text.length) break;
                        const item = nodes[count % len]!;
                        const thisMatch = applyRule(path + "/*", item, i, locals, dynamics);
                        if (thisMatch instanceof MatchFail) {
                            if (thisMatch.cut === Infinity) return thisMatch;
                            if (thisMatch.cut > 0) {
                                if (inCommittedScope()) {
                                    // don't leak cuts, to allow resync
                                    const end = max(thisMatch.i, i + 1);
                                    children.push(errorNode(i, end, thisMatch.expected));
                                    i = end;
                                    continue;
                                }
                                // Not committed: panic-mode resync to next match.
                                const next = recover(path + "/*", item, i, thisMatch, children, locals, dynamics);
                                if (next <= i) break; // nowhere left to go
                                i = next;
                                continue;
                            }
                            if (g.f === "r" && count < 1) return thisMatch;
                            // normal failure
                            break;
                        }
                        if (thisMatch.end === i) break; // no progress = stop
                        children.push(thisMatch);
                        i = thisMatch.end;
                    }
                }
                return { start, end: i, children };
            }
            case "joined": {
                const start = i;
                const children: CSTNode[] = [];
                const elemRule = g.c![0]!, sepRule = g.j!;
                const require2 = /2/.test(g.f!);
                const trailing = /t/.test(g.f!);
                for (; ;) {
                    if (i >= text.length) {
                        if (children.length < (require2 ? 3 : 1)) return new MatchFail(i, 0, elemRule);
                        break;
                    }
                    const elem = applyRule(path + "/e", elemRule, i, locals, dynamics);
                    if (elem instanceof MatchFail) {
                        if (elem.cut === Infinity) return elem;
                        if (elem.cut > 0) {
                            if (inCommittedScope()) {
                                // Inside a committed construct: keep it local.
                                const end = max(elem.i, i + 1);
                                children.push(errorNode(i, end, elem.expected));
                                i = end;
                                continue;
                            }
                            const next = recover(path + "/e", elemRule, i, elem, children, locals, dynamics);
                            if (next <= i) break;
                            i = next;
                            continue;
                        }
                        if (children.length < (require2 ? 3 : 1)) return elem; // need at least one or two elements
                        // trailing sep is cut-fail
                        if (trailing) break;
                        return new MatchFail(elem.i, 1, elem.expected);
                    }
                    children.push(elem);
                    i = elem.end;
                    const s = applyRule(path + "/s", sepRule, i, locals, dynamics);
                    if (s instanceof MatchFail) {
                        if (s.cut === Infinity) return s;
                        if (s.cut > 0) {
                            if (inCommittedScope()) {
                                const end = max(s.i, i + 1);
                                children.push(errorNode(i, end, s.expected));
                                i = end;
                                continue;
                            }
                            const next = recover(path + "/s", sepRule, i, s, children, locals, dynamics);
                            if (next <= i) break;
                            i = next;
                            continue;
                        }
                        if (children.length < (require2 ? 3 : 1)) return s; // need at least one or two elements
                        break; // no separator: done
                    }
                    if (s.end === i) break; // empty separator ?!?
                    children.push(s);
                    i = s.end;
                }
                return { start, end: i, children };
            }
            case "if": {
                return applyRule(path + "/c", g.j!, i, locals, dynamics) instanceof MatchFail ? applyRule(path + "/f", g.c![1]!, i, locals, dynamics) : applyRule(path + "/t", g.c![0]!, i, locals, dynamics);
            }
            case "cut": {
                const f = last(cutStack);
                if (f) f[0] = max(f[0], g.v as number);
                return { ignored: true, start: i, end: i };
            }
            case "lookahead": {
                const cst = applyRule(path + "/?", g.c![0]!, i, locals, dynamics);
                const neg = g.f === "-";
                if (!neg && g.f !== "+") badflag();
                return cst instanceof MatchFail === neg ? { ignored: true, start: i, end: i } : new MatchFail(i, 0, g);
            }
            case "sameline":
            case "nonempty": {
                const cst = applyRule(path + "/", g.c![0]!, i, locals, dynamics);
                return cst instanceof MatchFail ? cst : (op === "nonempty" ? cst.end === i : text.slice(cst.start, cst.end).indexOf("\n") >= 0) ? new MatchFail(i, 0, g) : cst;
            }
            case "eps":
                return { start: i, end: i };
            case "try": {
                // Speculative parse: if node fails, hide the cuts
                const savedCuts = cutStack.map(frame => frame[0]);
                const cst = applyRule(path + "/", g.c![0]!, i, locals, dynamics);
                if (cst instanceof MatchFail) {
                    for (var k = 0; k < savedCuts.length; k++) cutStack[k]![0] = savedCuts[k]!;
                    cutStack.length = savedCuts.length;
                    return new MatchFail(cst.i, 0, cst.expected);
                }
                return cst;
            }
            case "die":
                return new MatchFail(i, Infinity, g);
            default:
                op satisfies never;
        }
        throw new Error("unknown grammar rule type " + (op ?? g) + " at " + path);
    }
    /**
     * Links `l` and every LR above it on the stack into a single head,
     * recording their rules as involved in the recursive cycle.
     */
    const setupLeftRecursion = (path: string, l: LR) => {
        l.head ??= { path, involved: new Set, eval: new Set };
        for (var s = lrStack; s && s.head !== l.head; s = s.next) {
            s.head = l.head;
            l.head.involved.add(s.path);
        }
    }
    /**
     * Grows the seed of a left-recursive rule: re-evaluates the rule body with
     * the current seed in the memo until a pass produces nothing longer,
     * memoizing each improvement.
     */
    const leftRecurse = (mpath: string, path: string, g: GrammarCombinator, i: number, l: LR, locals: Locals, dynamics: Dynamics): CSTNode | MatchFail => {
        if (l.head?.path !== mpath) return l.seed;
        const loc = toMemoLoc(mpath, i);
        memo[loc] = l.seed;
        if (l.seed instanceof MatchFail) return l.seed;
        // grow left recursion
        const head = l.head!;
        heads[i] = head;
        for (; ;) {
            head.eval = new Set(head.involved);
            consumeCut();
            const ans = callRule(path, g, i, locals, dynamics);
            if (ans instanceof MatchFail || ans.end <= (l.seed as CSTNode).end) break;
            l.seed = ans;
            memo[loc] = ans;
        }
        heads[i] = undefined;
        return l.seed;
    }
    /**
     * Memo lookup with left-recursion bookkeeping: while a head is active at
     * this index, rules that are not part of its cycle fail synthetically,
     * and rules in its `eval` set are re-evaluated once instead of recalled.
     */
    const recall = (mpath: string, path: string, g: GrammarCombinator, i: number, locals: Locals, dynamics: Dynamics): CSTNode | LR | MatchFail | undefined => {
        const m = memo[toMemoLoc(mpath, i)];
        const h = heads[i];
        if (!h) return m as any;
        if (!m && mpath !== h.path && !h.involved.has(mpath)) return new MatchFail(i, 0, g);
        if (h.eval.has(mpath)) {
            h.eval.delete(mpath);
            const ans = callRule(path, g, i, locals, dynamics);
            memo[toMemoLoc(mpath, i)] = ans;
            return ans;
        } else return m;
    }
    /**
     * Memoizing entry point for matching `g` at index `i`: returns the
     * memoized result if there is one; otherwise evaluates `g` with a fresh
     * LR on the stack so that a recursive cycle, if any, is detected.
     */
    const applyRule = (path: string, g: GrammarCombinator, i: number, locals: Locals, dynamics: Dynamics): CSTNode | MatchFail => {
        // While dynamic bindings are in effect, their chain's key is part of
        // this call's identity: a result computed under one ambient context
        // must never be reused under another. With no bindings in effect the
        // identity is the normal path.
        const dPath = dynamics ? path + "@" + dynamics.key : path;
        const m = recall(dPath, path, g, i, locals, dynamics);
        if (m) {
            if (m instanceof LR) {
                setupLeftRecursion(dPath, m);
                return m.seed;
            } else {
                return m;
            }
        }
        const lr = lrStack = new LR(dPath, new MatchFail(i, 0, g), undefined, lrStack);
        memo[toMemoLoc(dPath, i)] = lr;
        const ans = callRule(path, g, i, locals, dynamics);
        lrStack = lrStack.next;
        memo[toMemoLoc(dPath, i)] = ans;
        if (lr.head) {
            lr.seed = ans;
            return leftRecurse(dPath, path, g, i, lr, locals, dynamics);
        } else {
            return ans;
        }
    }
    const ans = applyRule("", rule(startRule), startIndex, undefined, undefined);
    if (ans instanceof MatchFail) {
        // The start rule didn't match at all: resync past any leading garbage.
        const children: CSTNode[] = [];
        const end = recover("", rule(startRule), startIndex, ans, children, undefined, undefined);
        if (children.length < 1) {
            // give up entirely
            children.push(errorNode(startIndex, end, ans.expected));
        }
        return { start: startIndex, end, children };
    }
    return ans;
}
