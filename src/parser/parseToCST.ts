import { javaHash } from "@r47onfire/game-math";
import { last } from "lib0/array";
import { imul, max } from "lib0/math";
import { Dynamics, Grammar, GrammarCombinator, GrammarOpDef, hashCombinator, Locals, MatchFail, MixAction, OpContext, opDefs, ReferenceResolver, rule } from "./combinator";
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

// Exported as types only, so they can be named in public signatures (and
// documentation) without exposing their constructors as public API;
// only the parser itself creates them.
export type { MatchFail } from "./combinator";
export type { Head, LR };

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
    /** A snapshot of the cut stack's depths, for speculative parses. */
    const snapshotCuts = (): number[] => cutStack.map(frame => frame[0]);
    /** Restores a snapshot taken with {@link snapshotCuts}. */
    const restoreCuts = (saved: readonly number[]) => {
        for (var k = 0; k < saved.length; k++) cutStack[k]![0] = saved[k]!;
        cutStack.length = saved.length;
    };
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
        const savedCuts = snapshotCuts();
        const savedLR = lrStack;
        const probe = applyRule(path, node, j, locals, dynamics);
        // restore cuts and LR stack
        restoreCuts(savedCuts);
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
    /** The services the operation definitions run against (see {@link OpContext}). */
    const ctx: OpContext = {
        text,
        grammar,
        applyRule: (path, node, i, locals, dynamics) => applyRule(path, node, i, locals, dynamics),
        errorNode,
        recover,
        recoverChild,
        cutDepth,
        consumeCut,
        committedDepth: () => cutStack.reduce((n, f) => n + (f[0] > 0 ? 1 : 0), 0),
        snapshotCuts,
        restoreCuts,
        pushCutFrame: () => cutStack.push([0]),
        popCutFrame: () => cutStack.pop()?.[0] ?? 0,
        applyCut: depth => { const f = last(cutStack); if (f) f[0] = max(f[0], depth); },
        inCommittedScope,
    };
    /**
     * Do the actual logic for the grammar node's operation, by dispatching
     * to its definition in the op table.
     */
    const callRule = (path: string, g: GrammarCombinator, i: number, locals: Locals, dynamics: Dynamics): CSTNode | MatchFail =>
        (opDefs[g.op] as GrammarOpDef).call(ctx, g, path, i, locals, dynamics);
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
    const leftRecurse = (mPath: string, path: string, g: GrammarCombinator, i: number, l: LR, locals: Locals, dynamics: Dynamics): CSTNode | MatchFail => {
        if (l.head?.path !== mPath) return l.seed;
        const loc = toMemoLoc(mPath, i);
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
    const recall = (mPath: string, path: string, g: GrammarCombinator, i: number, locals: Locals, dynamics: Dynamics): CSTNode | LR | MatchFail | undefined => {
        const m = memo[toMemoLoc(mPath, i)];
        const h = heads[i];
        if (!h) return m as any;
        if (!m && mPath !== h.path && !h.involved.has(mPath)) return new MatchFail(i, 0, g);
        if (h.eval.has(mPath)) {
            h.eval.delete(mPath);
            const ans = callRule(path, g, i, locals, dynamics);
            memo[toMemoLoc(mPath, i)] = ans;
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
