import { last } from "lib0/array";
import { isString } from "lib0/function";
import { max } from "lib0/math";
import { GrammarCombinator, rule } from "./combinator";
import { CSTNode } from "./cst";

export type MemoLoc = `${number}#${string}`;
const toMemoLoc = (path: string, index: number): MemoLoc => `${index}#${path}`;

interface Head {
    path: string,
    involved: Set<string>,
    eval: Set<string>
}

class LR {
    constructor(
        readonly path: string,
        public seed: CSTNode | MatchFail,
        public head: Head | undefined,
        readonly next: LR | undefined
    ) { }
}

class MatchFail {
    constructor(readonly i: number, readonly cut: number, readonly expected: GrammarCombinator) { }
}

export type Memo = Record<MemoLoc, CSTNode | MatchFail | LR>;
export type Grammar = Readonly<Record<string, GrammarCombinator>>;

/**
 * Parse text into a CST. The CST may contain error nodes if there were syntax errors.
 */
export const parseToCST = (text: string, startIndex: number, startRule: string, grammar: Grammar, errorType = "BAD", memo: Memo = {}): CSTNode => {
    const heads: (Head | undefined)[] = [];
    var lrStack: LR | undefined;
    const cutStack: [number][] = [];
    const cutDepth = () => last(cutStack)?.[0] ?? 0;
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
    const probeAt = (path: string, node: GrammarCombinator, j: number): CSTNode | null => {
        const savedCuts = cutStack.map(frame => frame[0]);
        const savedLR = lrStack;
        const probe = applyRule(path, node, j);
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
    const recover = (path: string, item: GrammarCombinator, i: number, fail: MatchFail, children: CSTNode[]): number => {
        if (i >= text.length) return i;
        for (var j = max(fail.i, i + 1); j <= text.length; j++) {
            const probe = probeAt(path, item, j);
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
     * The skipped text (BAD) and the recovered child are wrapped in a single
     * "exprs" node, so existing fixed-length sequences keep their fixed arity.
     * 
     * TODO: "exprs" should not be hardcoded, to allow this to work with other grammars.
     */
    const recoverChild = (path: string, child: GrammarCombinator, i: number, fail: MatchFail, children: CSTNode[]): number | null => {
        for (var j = i + 1; j <= text.length; j++) {
            const probe = probeAt(path, child, j);
            if (!probe) continue;
            children.push({
                type: "exprs",
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
    const callRule = (path: string, g: GrammarCombinator, i: number): CSTNode | MatchFail => {
        const op = g?.op;
        switch (op) {
            case "token": {
                const p = g.pattern;
                if (g.isRegex) {
                    const re = new RegExp(p, g.flags + "y");
                    re.lastIndex = i;
                    const match = re.exec(text);
                    return match ? { text: match[0], type: g.type, start: i, end: i + match[0].length } : new MatchFail(i, 0, g);
                } else {
                    return text.startsWith(p, i) ? { text: p, type: g.type, start: i, end: i + p.length } : new MatchFail(i, 0, g);
                }
            }
            case "ignored": {
                const cst = applyRule(path + "/", g.node, i);
                return cst instanceof MatchFail ? cst : { ignored: true, start: cst.start, end: cst.end, children: [cst] };
            }
            case "rule": {
                const rule = grammar[g.rule];
                if (!rule) throw new Error("unknown named rule " + g.rule + " at " + path);
                cutStack.push([0]);
                const cst = applyRule(g.rule, rule, i);
                const frameDepth = cutDepth();
                cutStack.pop();
                if (cst instanceof MatchFail) {
                    const d = max(cst.cut, frameDepth);
                    return d === cst.cut ? cst : new MatchFail(cst.i, d, cst.expected);
                }
                // Don't nest when the rule only delegated to another named rule
                if (cst.text === undefined && isString(cst.type)) return cst;
                return { type: g.rule, start: cst.start, end: cst.end, children: [cst] };
            }
            case "tag": {
                const cst = applyRule(path + "/", g.node, i);
                return cst instanceof MatchFail ? cst : { tag: g.tag, start: cst.start, end: cst.end, children: [cst] };
            }
            case "sequence":
            case "seq_sep": {
                const children: CSTNode[] = [];
                const start = i;
                const items = g.nodes, len = items.length;
                var committed = false;
                const sep = () => {
                    if (op !== "seq_sep") return;
                    const sepThing = applyRule(path + "/s", g.sep, i);
                    if (sepThing instanceof MatchFail) {
                        children.push({ ignored: true, start: i, end: i });
                    } else {
                        children.push({ ignored: true, start: sepThing.start, end: sepThing.end, children: [sepThing] });
                        i = sepThing.end;
                    }
                }
                for (var j = 0; j < len; j++) {
                    sep();
                    const child = items[j]!;
                    if (child.op === "cut") committed = true;
                    const thisMatch = applyRule(path + "/" + j, child, i);
                    if (thisMatch instanceof MatchFail) {
                        if (thisMatch.cut === Infinity) return thisMatch;
                        if (committed) {
                            // resync to the failed child (without breaking the outer grammar node)
                            var depth = 0;
                            for (const frame of cutStack) if (frame[0] > 0) depth++;
                            if (depth > 1) return thisMatch;
                            const resumed = recoverChild(path + "/" + j, child, i, thisMatch, children);
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
            case "alternatives": {
                const items = g.nodes, len = items.length;
                const options: CSTNode[] = [];
                var furthestFail: MatchFail | undefined;
                for (var j = 0; j < len; j++) {
                    const thisMatch = applyRule(path + "/" + j, items[j]!, i);
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
                    options.push(thisMatch);
                }
                return options.length < 1 ? (furthestFail ?? new MatchFail(i, 0, g)) : options.reduce((a, b) => b.end > a.end ? b : a);
            }
            case "optional": {
                const cst = applyRule(path + "/", g.node, i);
                // don't swallow a cut fail
                return cst instanceof MatchFail ? (cst.cut > 0 ? cst : { start: i, end: i }) : cst;
            }
            case "repeat":
            case "repeat_seq": {
                const start = i;
                const children: CSTNode[] = [];
                const nodes = op === "repeat_seq" ? g.nodes : [g.node], len = nodes.length;
                if (len > 0) {
                    for (var count = 0; ; count++) {
                        if (i >= text.length) break;
                        const item = nodes[count % len]!;
                        const thisMatch = applyRule(path + "/*", item, i);
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
                                const next = recover(path + "/*", item, i, thisMatch, children);
                                if (next <= i) break; // nowhere left to go
                                i = next;
                                continue;
                            }
                            if (g.required && count < 1) return thisMatch;
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
                for (; ;) {
                    if (i >= text.length) break;
                    const elem = applyRule(path + "/e", g.node, i);
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
                            const next = recover(path + "/e", g.node, i, elem, children);
                            if (next <= i) break;
                            i = next;
                            continue;
                        }
                        if (children.length < (g.require2 ? 3 : 1)) return elem; // need at least one or two elements
                        // trailing sep is cut-fail
                        if (g.trailing) break;
                        return new MatchFail(elem.i, 1, elem.expected);
                    }
                    children.push(elem);
                    i = elem.end;
                    const s = applyRule(path + "/s", g.sep, i);
                    if (s instanceof MatchFail) {
                        if (s.cut === Infinity) return s;
                        if (s.cut > 0) {
                            if (inCommittedScope()) {
                                const end = max(s.i, i + 1);
                                children.push(errorNode(i, end, s.expected));
                                i = end;
                                continue;
                            }
                            const next = recover(path + "/s", g.sep, i, s, children);
                            if (next <= i) break;
                            i = next;
                            continue;
                        }
                        if (children.length < (g.require2 ? 3 : 1)) return s; // need at least one or two elements
                        break; // no separator: done
                    }
                    if (s.end === i) break; // empty separator ?!?
                    children.push(s);
                    i = s.end;
                }
                return { start, end: i, children };
            }
            case "if": {
                return applyRule(path + "/c", g.cond, i) instanceof MatchFail ? applyRule(path + "/f", g.false, i) : applyRule(path + "/t", g.true, i);
            }
            case "cut": {
                const f = last(cutStack);
                if (f) f[0] = max(f[0], g.depth);
                return { ignored: true, start: i, end: i };
            }
            case "lookahead": {
                const cst = applyRule(path + "/?", g.node, i);
                return cst instanceof MatchFail === g.negative ? { ignored: true, start: i, end: i } : new MatchFail(i, 0, g);
            }
            case "assert_sameline":
            case "assert_nonempty": {
                const cst = applyRule(path + "/", g.node, i);
                return cst instanceof MatchFail ? cst : (op === "assert_nonempty" ? cst.end === i : text.slice(cst.start, cst.end).indexOf("\n") >= 0) ? new MatchFail(i, 0, g) : cst;
            }
            case "nothing":
                return { start: i, end: i };
            case "try": {
                // Speculative parse: if node fails, hide the cuts
                const savedCuts = cutStack.map(frame => frame[0]);
                const cst = applyRule(path + "/", g.node, i);
                if (cst instanceof MatchFail) {
                    for (var k = 0; k < savedCuts.length; k++) cutStack[k]![0] = savedCuts[k]!;
                    cutStack.length = savedCuts.length;
                    return new MatchFail(cst.i, 0, cst.expected);
                }
                return cst;
            }
            case "fail_fast":
                return new MatchFail(i, Infinity, g);
            default:
                op satisfies never;
        }
        throw new Error("unknown grammar rule type " + (op ?? g) + " at " + path);
    }
    const setupLeftRecursion = (path: string, l: LR) => {
        l.head ??= { path, involved: new Set, eval: new Set };
        for (var s = lrStack; s && s.head !== l.head; s = s.next) {
            s.head = l.head;
            l.head.involved.add(s.path);
        }
    }
    const leftRecurse = (path: string, g: GrammarCombinator, i: number, l: LR): CSTNode | MatchFail => {
        if (l.head?.path !== path) return l.seed;
        const loc = toMemoLoc(path, i);
        memo[loc] = l.seed;
        if (l.seed instanceof MatchFail) return l.seed;
        return growLeftRecursion(path, g, i, l, loc);
    }
    const growLeftRecursion = (path: string, g: GrammarCombinator, i: number, l: LR, loc: MemoLoc): CSTNode | MatchFail => {
        const head = l.head!;
        heads[i] = head;
        try {
            while (true) {
                head.eval = new Set(head.involved);
                consumeCut();
                const ans = callRule(path, g, i);
                if (ans instanceof MatchFail || ans.end <= (l.seed as CSTNode).end) return l.seed;
                l.seed = ans;
                memo[loc] = ans;
            }
        } finally {
            heads[i] = undefined;
        }
    }
    const recall = (path: string, g: GrammarCombinator, i: number): CSTNode | LR | MatchFail | undefined => {
        const m = memo[toMemoLoc(path, i)];
        const h = heads[i];
        if (!h) return m as any;
        if (!m && path !== h.path && !h.involved.has(path)) return new MatchFail(i, 0, g);
        if (h.eval.has(path)) {
            h.eval.delete(path);
            const ans = callRule(path, g, i);
            memo[toMemoLoc(path, i)] = ans;
            return ans;
        } else return m;
    }
    const applyRule = (path: string, g: GrammarCombinator, i: number): CSTNode | MatchFail => {
        const m = recall(path, g, i);
        if (m) {
            if (m instanceof LR) {
                setupLeftRecursion(path, m);
                return m.seed;
            } else {
                return m;
            }
        }
        const lr = lrStack = new LR(path, new MatchFail(i, 0, g), undefined, lrStack);
        memo[toMemoLoc(path, i)] = lr;
        const ans = callRule(path, g, i);
        lrStack = lrStack.next;
        memo[toMemoLoc(path, i)] = ans;
        if (lr.head) {
            lr.seed = ans;
            return leftRecurse(path, g, i, lr);
        } else {
            return ans;
        }
    }
    const ans = applyRule("", rule(startRule), startIndex);
    if (ans instanceof MatchFail) {
        // The start rule didn't match at all: resync past any leading garbage.
        const children: CSTNode[] = [];
        const end = recover("", rule(startRule), startIndex, ans, children);
        if (children.length < 1) {
            // give up entirely
            children.push(errorNode(startIndex, end, ans.expected));
        }
        return { start: startIndex, end, children };
    }
    return ans;
}
