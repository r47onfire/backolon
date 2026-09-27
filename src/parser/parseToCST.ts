import { last } from "lib0/array";
import { max } from "lib0/math";
import { CSTNode } from "./cst";
import { GrammarCombinator } from "./combinator";

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

export class MatchFail {
    constructor(readonly i: number, readonly cut: number, readonly expected: GrammarCombinator) { }
}

export type Memo = Record<MemoLoc, CSTNode | MatchFail | LR>;
export type Grammar = Readonly<Record<string, GrammarCombinator>>;

export const parseToCST = (text: string, startIndex: number, startRule: string, grammar: Grammar, memo: Memo = {}): CSTNode | MatchFail => {
    const heads: (Head | undefined)[] = [];
    var lrStack: LR | undefined;
    const cutStack: [number][] = [];
    const cutDepth = () => last(cutStack)?.[0] ?? 0;
    const consumeCut = () => { if (cutStack.length) last(cutStack)![0] = 0; };
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
            case "rule": {
                const rule = grammar[g.rule];
                if (!rule) throw new Error("unknown named rule " + g.rule + " at " + path);
                cutStack.push([0]);
                const cst = applyRule(g.rule, rule, i);
                cutStack.pop();
                if (cst instanceof MatchFail) return isFinite(cst.cut) ? new MatchFail(cst.i, 0, cst.expected) : cst;
                // Don't nest when the rule only delegated to another named rule
                if (cst.text === undefined && typeof cst.type === "string" && cst.type !== "") return cst;
                return { type: g.rule, start: cst.start, end: cst.end, children: [cst] };
            }
            case "transform": {
                const cst = applyRule(path + "/", g.node, i);
                return cst instanceof MatchFail ? cst : { transform: g.transformer, start: cst.start, end: cst.end, children: [cst] };
            }
            case "tag": {
                const cst = applyRule(path + "/", g.node, i);
                return cst instanceof MatchFail ? cst : { tag: g.tag, start: cst.start, end: cst.end, children: [cst] };
            }
            case "sequence": {
                const children: CSTNode[] = [];
                const start = i;
                const items = g.nodes, len = items.length;
                for (var j = 0; j < len; j++) {
                    const thisMatch = applyRule(path + "/" + j, items[j]!, i);
                    if (thisMatch instanceof MatchFail) return thisMatch;
                    if (thisMatch.end > thisMatch.start) children.push(thisMatch);
                    i = thisMatch.end;
                }
                return { start, end: i, children };
            }
            case "alternatives": {
                const items = g.nodes, len = items.length;
                const options: CSTNode[] = [];
                for (var j = 0; j < len; j++) {
                    const thisMatch = applyRule(path + "/" + j, items[j]!, i);
                    if (thisMatch instanceof MatchFail) {
                        const d = max(thisMatch.cut, cutDepth());
                        if (d === 0) continue;
                        consumeCut();
                        return new MatchFail(thisMatch.i, d - 1, thisMatch.expected);
                    }
                    options.push(thisMatch);
                }
                return options.length < 1 ? new MatchFail(i, 0, g) : options.reduce((a, b) => b.end > a.end ? b : a);
            }
            case "optional": {
                const plus: GrammarCombinator = { op: "assert_nonempty", node: g.node };
                const minus: GrammarCombinator = { op: "epsilon" };
                return applyRule(path + "/", {
                    op: "alternatives",
                    nodes: g.greedy ? [plus, minus] : [minus, plus]
                }, i);
            }
            case "repeat": {
                // TODO: sequence, repeat, and repeat_seq are all very similar
                const start = i;
                const children: CSTNode[] = [];
                for (var count = 0; ; count++) {
                    const thisMatch = applyRule(path + "/*", g.node, i);
                    if (thisMatch instanceof MatchFail) {
                        if (thisMatch.cut > 0) return thisMatch;
                        if (g.required && count < 1) return thisMatch;
                        // normal failure
                        break;
                    }
                    if (thisMatch.end === i) break; // no progress = stop
                    children.push(thisMatch);
                    i = thisMatch.end;
                }
                return { start, end: i, children };
            }
            case "repeat_seq": {
                const start = i;
                const children: CSTNode[] = [];
                const nodes = g.nodes, len = nodes.length;
                for (var count = 0; ; count++) {
                    const thisMatch = applyRule(path + "/*", nodes[count % len]!, i);
                    if (thisMatch instanceof MatchFail) {
                        if (thisMatch.cut > 0) return thisMatch;
                        if (g.required && count < 1) return thisMatch;
                        // normal failure
                        break;
                    }
                    if (thisMatch.end === i) break; // no progress = stop
                    children.push(thisMatch);
                    i = thisMatch.end;
                }
                return { start, end: i, children };
            }
            case "cut": {
                const f = last(cutStack);
                if (f) f[0] = max(f[0], g.depth);
                return { start: i, end: i };
            }
            case "lookahead": {
                const adv = applyRule(path + "/?", g.node, i);
                return adv instanceof MatchFail === g.negative ? { start: i, end: i } : new MatchFail(i, 0, g);
            }
            case "assert_nonempty": {
                const adv = applyRule(path + "/", g.node, i);
                return adv instanceof MatchFail ? adv : adv.end === i ? new MatchFail(i, 0, g) : adv;
            }
            case "epsilon":
                return { start: i, end: i };
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
    return applyRule(startRule, grammar[startRule]!, startIndex);
}
