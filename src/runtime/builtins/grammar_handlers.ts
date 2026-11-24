import { LinkedList } from "@r47onfire/game-math";
import { CSTNode, cut, ignored, lit, regex, seq } from "@r47onfire/nebula";
import { abs } from "lib0/math";
import { BSyntaxError, BTypeError } from "../../errors/classes";
import { StackTreeNode } from "../../errors/compress";
import { Builtin, Signature } from "../../obj/builtin_function";
import { Env } from "../env";
import { handleError, TryCatchHandler } from "../trycatch";
import type { FormFunc, Task, TaskGen } from "../vm";

/**
 * The signature every run handler is called with: one argument, the form being
 * evaluated, delivered unevaluated -- a run handler IS the evaluation of its
 * form, so the form cannot be evaluated first.
 */
const FORM_SIG: Signature<["node"], never, [], never> = {
    byName: { node: { kind: "normal" } },
    head: ["node"],
    tail: [],
};

/**
 * Build a run handler from its implementation. The implementation receives the
 * form as a CSTNode; the call machinery delivers arguments as unknown values,
 * so the narrowing to a node happens here, once.
 */
export const makeFormFunc = (
    impl: (
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        node: CSTNode<any>,
    ) => TaskGen<any>,
): FormFunc =>
    new Builtin<Signature<["node"], never, [], never>, any>(function* (
        task,
        env,
        traceback,
        handlers,
        node,
    ) {
        while (!(node instanceof CSTNode)) {
            node = yield* handleError(
                task,
                env,
                traceback,
                handlers,
                new BTypeError("backolon.eval.not_a_cst_node"),
            );
        }
        return yield* impl(
            task,
            env,
            traceback,
            handlers,
            node as CSTNode<any>,
        );
    }, FORM_SIG);

/**
 * The text a leaf form wraps: a name's identifier, a number's digits, a string
 * part's characters -- always the leaf's one text child.
 */
const leafText = (node: CSTNode<any>): string => node.children![0]!.text!;

const pureValueCache = new WeakMap<CSTNode<any>, any>();

/** Whether every part of `node` is marked pure in the grammar. */
export const allPartsPure = (task: Task, node: CSTNode<any>): boolean =>
    node.children!.every((part) => task.grammar[part.type]?.pure === true);

/** Demote a BigInt to a Number when it would be safe to do so. */
const collapseBigInt = (n: bigint): bigint | number => {
    const n2 = Number(n);
    return Number.isFinite(n2) && BigInt(n2) === n ? n2 : n;
};

/** The exact value of an integer literal's digits in the given base. */
export const integerValue = (digits: string, base: number): bigint | number =>
    collapseBigInt(
        [...digits].reduce(
            (acc, ch) => acc * BigInt(base) + BigInt(parseInt(ch, base)),
            0n,
        ),
    );

/**
 * The value of a decimal literal: computed exactly, like an integer, when the
 * literal's exact value is an integer in range; the nearest double otherwise.
 */
export const decimalValue = (text: string): bigint | number => {
    if (!/[.e]/i.test(text)) return integerValue(text, 10);
    const [mantissa, exp] = text.split(/e/i);
    const [int, frac = ""] = mantissa!.split(".");
    const decimalPoint = Number(exp ?? 0) - frac.length;
    const sigFigs = BigInt(int + frac);
    if (abs(decimalPoint) <= 10000) {
        if (decimalPoint >= 0)
            return collapseBigInt(sigFigs * 10n ** BigInt(decimalPoint));
        if (sigFigs % 10n ** BigInt(-decimalPoint) === 0n)
            return collapseBigInt(sigFigs / 10n ** BigInt(-decimalPoint));
    }
    return parseFloat(text);
};

/** The one-character escapes an interpolated string recognizes. */
const KNOWN_ESCAPES: Record<string, string> = {
    a: "\x07",
    b: "\b",
    e: "\x1b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    z: "\0",
    '"': '"',
    "'": "'",
    "\\": "\\",
};

/**
 * The run implementation shared by both string forms: the parts, each evaluated
 * to the string it stands for, concatenated. The result is cached when every
 * part is pure -- a string with an interpolation in it is not, so it is
 * recomputed, and its interpolations re-evaluated, every time it is evaluated.
 */
export const stringValue = function* (
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    node: CSTNode<any>,
): TaskGen<string> {
    if (pureValueCache.has(node)) return pureValueCache.get(node);
    let out = "";
    for (const part of node.children!)
        out += yield* task.eval(part, env, traceback, handlers, []);
    if (allPartsPure(task, node)) pureValueCache.set(node, out);
    return out;
};

/**
 * The run implementation for `number`: the value of its one part, cached the
 * same way as a string's -- every number part is pure, so a number literal is a
 * constant.
 */
export const numberValue = function* (
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    node: CSTNode<any>,
): TaskGen<bigint | number> {
    if (pureValueCache.has(node)) return pureValueCache.get(node);
    const value = yield* task.eval(
        node.children![0]!,
        env,
        traceback,
        handlers,
        [],
    );
    if (allPartsPure(task, node)) pureValueCache.set(node, value);
    return value;
};

export const hexEscape = makeFormFunc(
    function* (task, env, traceback, handlers, node) {
        return String.fromCodePoint(parseInt(leafText(node), 16));
    },
);

export const knownEscape = makeFormFunc(
    function* (task, env, traceback, handlers, node) {
        const ch = leafText(node);
        const decoded = KNOWN_ESCAPES[ch];
        if (decoded === undefined) {
            return yield* handleError(
                task,
                env,
                traceback,
                handlers,
                new BSyntaxError("backolon.string.unknown_escape", ch),
            );
        }
        return decoded;
    },
);
