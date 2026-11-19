import type { LinkedList } from "@r47onfire/game-math";
import { CSTNode, Span } from "@r47onfire/nebula";
import { BTypeError, type StackTreeNode } from "../errors";
import { StackEntryKind, tbAdd } from "../errors/compress";
import type { Signature, SignatureParam } from "../obj";
import { type Identifier, objectEntries } from "../utils";
import { makeBlock } from "./block";
import { Env } from "./env";
import { type TryCatchHandler, handleError } from "./trycatch";
import type { Task, TaskGen } from "./vm";

/**
 * Bind a call's given arguments against the callee's signature and return the
 * bound values in signature order. Given arguments are processed one by one
 * according to their parameter's kind; defaults fill whatever is left.
 *
 * @see {@link Signature}
 */
export function doargs<P extends Signature>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    sig: P,
    args: CSTNode<any>[],
    computed?: false,
): TaskGen<any[]>;
export function doargs<P extends Signature>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    sig: P,
    args: any[],
    computed: true,
): TaskGen<any[]>;
export function* doargs<P extends Signature>(
    task: Task,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
    { head, tail, byName, posRest, kwRest, closureEnv }: P,
    args: any[],
    computed?: boolean,
): TaskGen<any[]> {
    const nHead = head.length,
        nTail = tail.length;

    // One classified given argument. `dest` is decided by the static pass:
    // the name of the parameter the argument is bound for, `REST` when it
    // collects into the keyword rest record, or null when it goes to the
    // positional middle pool (splat items always do).
    const REST = "";
    interface Given {
        kind: "pos" | "kw" | "splat" | "kwSplat";
        /**
         * The form to evaluate (a kw argument's value form); unused when
         * computed
         */
        form: CSTNode<any>;
        /** The already-computed value; unused when not computed */
        value?: any;
        /** The keyword name, for kind "kw" */
        name?: Identifier;
        /**
         * True for an empty argument (a hole between commas): claims a slot,
         * but forces the default
         */
        hole?: boolean;
        dest?: Identifier | typeof REST | null;
    }
    const given: Given[] = [];
    let firstSplat = -1,
        lastSplat = -1;
    if (computed) {
        for (let i = 0; i < args.length; i++)
            given.push({ kind: "pos", form: null as any, value: args[i] });
    } else {
        for (let i = 0; i < args.length; i++) {
            const a = args[i] as CSTNode<any>;
            if (a.type === "kw")
                given.push({
                    kind: "kw",
                    form: a.children[1]!,
                    name: keyOf(a.children[0]!),
                });
            else if (a.type === "splat" || a.type === "splat_kw") {
                if (firstSplat < 0) firstSplat = i;
                lastSplat = i;
                given.push({
                    kind: a.type === "splat" ? "splat" : "kwSplat",
                    form: a.children[0]!,
                });
            } else if (a.type === "empty_arg")
                given.push({ kind: "pos", form: a, hole: true });
            else given.push({ kind: "pos", form: a });
        }
    }

    const claimed = new Set<Identifier>();
    const isParam = (name: Identifier) =>
        name !== posRest && name !== kwRest && Reflect.has(byName, name);

    const tbParam = (name: Identifier | undefined, location: Span) =>
        tbAdd(name, location, StackEntryKind.PARAMETER, traceback);

    // ---- static pass: decide where everything goes before evaluating
    // anything, so a binding error is raised without side effects.
    // Keyword arguments claim their parameters first, wherever they appear:
    // a positional argument never takes a parameter a keyword claimed.
    for (let i = 0; i < given.length; i++) {
        const g = given[i]!;
        if (g.kind !== "kw") continue;
        const name = g.name!;
        if (isParam(name)) {
            if (claimed.has(name))
                return yield* handleError(
                    task,
                    env,
                    tbParam(name, g.form.span),
                    handlers,
                    new BTypeError("backolon.call.duplicate_argument", name),
                );
            claimed.add(name);
            g.dest = name;
        } else if (kwRest !== undefined) g.dest = REST;
        else
            return yield* handleError(
                task,
                env,
                tbParam(name, g.form.span),
                handlers,
                new BTypeError("backolon.call.unknown_keyword", name),
            );
    }
    // Positional arguments before the first splat anchor to the head
    // parameters, the ones after the last splat anchor to the tail
    // parameters, and the ones in between are dynamic (the middle pool).
    // With no splats every positional is in both anchor lists, and the two
    // claims meet in the middle.
    const front: Given[] = [],
        back: Given[] = [],
        middle: Given[] = [];
    for (let i = 0; i < given.length; i++) {
        const g = given[i]!;
        if (g.kind !== "pos") continue;
        if (firstSplat < 0 || i < firstSplat) front.push(g);
        if (firstSplat < 0 || i > lastSplat) back.push(g);
        if (firstSplat >= 0 && i > firstSplat && i < lastSplat) middle.push(g);
    }
    let fi = 0;
    for (let h = 0; h < nHead && fi < front.length; h++) {
        const name = head[h]!;
        if (claimed.has(name)) continue;
        const g = front[fi++]!;
        claimed.add(name);
        g.dest = name;
    }
    let bi = back.length - 1;
    for (let t = nTail - 1; t >= 0 && bi >= 0; t--) {
        const name = tail[t]!;
        if (claimed.has(name)) continue;
        const g = back[bi]!;
        if (g.dest !== undefined) break; // the two claims met
        bi--;
        claimed.add(name);
        g.dest = name;
    }
    // Unclaimed anchored arguments join the middle pool; the pool is filled
    // in source order during the evaluation pass regardless.
    for (let i = fi; i < front.length; i++)
        if (front[i]!.dest === undefined) front[i]!.dest = null;
    for (let i = 0; i <= bi; i++)
        if (back[i]!.dest === undefined) back[i]!.dest = null;
    for (let i = 0; i < middle.length; i++) middle[i]!.dest = null;
    if (firstSplat < 0 && posRest === undefined) {
        const firstTooMany = given.find((g) => g.dest === null);
        if (firstTooMany) {
            return yield* handleError(
                task,
                env,
                firstTooMany.form
                    ? tbParam(undefined, firstTooMany.form.span)
                    : traceback,
                handlers,
                new BTypeError("backolon.call.too_many_arguments", args),
            );
        }
    }

    // A computed value can never fill a lazy or block parameter; with a
    // computed call every destination is already known, so this is static.
    if (computed)
        for (let i = 0; i < given.length; i++) {
            const g = given[i]!;
            if (
                typeof g.dest === "string" &&
                g.dest !== REST &&
                byName[g.dest]!.kind !== "normal"
            )
                return yield* handleError(
                    task,
                    env,
                    traceback,
                    handlers,
                    new BTypeError("backolon.call.lazy_computed", g.value),
                );
        }

    // ---- evaluation pass: in source order, each argument is processed the
    // way its parameter's kind demands.
    const bound = new Map<Identifier, any>();
    const pool: any[] = [];
    const HOLE = Symbol("hole");
    const kwRecord: Record<Identifier, any> = {};

    function* supply(
        param: SignatureParam,
        form: CSTNode<any>,
        inEnv: Env,
    ): TaskGen<any> {
        if (param.kind === "lazy") return form;
        if (param.kind === "block") return makeBlock([form], inEnv);
        return yield* task.eval(form, inEnv, traceback, handlers, []);
    }

    for (let i = 0; i < given.length; i++) {
        const g = given[i]!;
        if (g.kind === "kw") {
            if (g.dest === REST) {
                kwRecord[g.name!] = computed
                    ? g.value
                    : yield* task.eval(g.form, env, traceback, handlers, []);
            } else {
                bound.set(
                    g.dest!,
                    yield* supply(byName[g.dest!]!, g.form, env),
                );
            }
        } else if (g.kind === "pos") {
            if (g.dest === null || g.dest === undefined) {
                pool.push(
                    g.hole
                        ? HOLE
                        : computed
                          ? g.value
                          : yield* task.eval(
                                g.form,
                                env,
                                traceback,
                                handlers,
                                [],
                            ),
                );
            } else if (g.hole) {
                // the parameter is claimed, but nothing is bound for it:
                // it falls to its default below
            } else if (computed) bound.set(g.dest, g.value);
            else bound.set(g.dest, yield* supply(byName[g.dest]!, g.form, env));
        } else if (g.kind === "splat") {
            const value = yield* task.eval(
                g.form,
                env,
                traceback,
                handlers,
                [],
            );
            if (
                typeof value === "string" ||
                !(Symbol.iterator in Object(value))
            )
                return yield* handleError(
                    task,
                    env,
                    tbParam(undefined, g.form.span),
                    handlers,
                    new BTypeError("backolon.call.splat.not_iterable", value),
                );
            for (const item of value) pool.push(item);
        } else {
            // kwSplat: the entries claim parameters dynamically, so a lazy
            // or block parameter can only be filled this way by mistake.
            const value = yield* task.eval(
                g.form,
                env,
                traceback,
                handlers,
                [],
            );
            let entries: [Identifier, any][];
            if (value instanceof Map) entries = [...value.entries()];
            else if (value !== null && typeof value === "object")
                entries = objectEntries(value);
            else
                return yield* handleError(
                    task,
                    env,
                    tbParam(undefined, g.form.span),
                    handlers,
                    new BTypeError(
                        "backolon.call.kw_splat.not_a_mapping",
                        value,
                    ),
                );
            for (let e = 0; e < entries.length; e++) {
                const { 0: key, 1: v } = entries[e]!;
                if (isParam(key)) {
                    if (claimed.has(key))
                        return yield* handleError(
                            task,
                            env,
                            tbParam(key, g.form.span),
                            handlers,
                            new BTypeError(
                                "backolon.call.duplicate_argument",
                                key,
                            ),
                        );
                    if (byName[key]!.kind !== "normal")
                        return yield* handleError(
                            task,
                            env,
                            tbParam(key, g.form.span),
                            handlers,
                            new BTypeError(
                                "backolon.call.kw_splat.lazy_computed",
                                v,
                            ),
                        );
                    claimed.add(key);
                    bound.set(key, v);
                } else if (kwRest !== undefined) kwRecord[key] = v;
                else
                    return yield* handleError(
                        task,
                        env,
                        tbParam(key, g.form.span),
                        handlers,
                        new BTypeError("backolon.call.unknown_keyword", key),
                    );
            }
        }
    }

    // Parameters the static pass could not place (a splat made the
    // positions dynamic) claim from the pool: head parameters from the
    // front, tail parameters from the back. A claim takes exactly one slot;
    // a hole in that slot leaves the parameter to its default.
    let poolFront = 0;
    function* claimFromPool(
        name: Identifier,
        fromBack: boolean,
    ): TaskGen<void> {
        claimed.add(name);
        if (poolFront >= pool.length) return; // nothing left: default
        const value = fromBack ? pool.pop() : pool[poolFront++];
        if (value === HOLE) return; // an empty slot: default
        if (byName[name]!.kind !== "normal")
            return yield* handleError(
                task,
                env,
                traceback,
                handlers,
                new BTypeError("backolon.call.lazy_computed", value),
            );
        bound.set(name, value);
    }
    for (let h = 0; h < nHead; h++)
        if (!claimed.has(head[h]!)) yield* claimFromPool(head[h]!, false);
    for (let t = nTail - 1; t >= 0; t--)
        if (!claimed.has(tail[t]!)) yield* claimFromPool(tail[t]!, true);
    let restValues: any[] = [];
    for (let i = poolFront; i < pool.length; i++)
        if (pool[i] !== HOLE) restValues.push(pool[i]);
    if (restValues.length > 0 && posRest === undefined)
        return yield* handleError(
            task,
            env,
            traceback,
            handlers,
            new BTypeError("backolon.call.too_many_arguments", args),
        );

    // Whatever is still unfilled falls to its default, processed the same
    // way an argument would be, in a scope over the signature's closure
    // environment and the caller's.
    const defaultsEnv =
        closureEnv !== undefined ? new Env([closureEnv, env]) : env;
    function* fillDefault(name: Identifier): TaskGen<void> {
        const param = byName[name]!;
        if (!param.opt)
            return yield* handleError(
                task,
                env,
                // TODO: point to the missing hole if it was given as explicitly missing
                traceback,
                handlers,
                new BTypeError("backolon.call.missing_argument", name),
            );
        bound.set(
            name,
            param.defaultForm !== undefined
                ? yield* supply(param, param.defaultForm, defaultsEnv)
                : null,
        );
    }
    for (let h = 0; h < nHead; h++)
        if (!bound.has(head[h]!)) yield* fillDefault(head[h]!);
    for (let t = 0; t < nTail; t++)
        if (!bound.has(tail[t]!)) yield* fillDefault(tail[t]!);

    const out: any[] = [];
    for (let h = 0; h < nHead; h++) out.push(bound.get(head[h]!));
    if (posRest !== undefined) out.push(restValues);
    for (let t = 0; t < nTail; t++) out.push(bound.get(tail[t]!));
    if (kwRest !== undefined) out.push(kwRecord);
    return out;
}

/**
 * The keyword name carried by a `kw` argument's left-hand side: the text of its
 * innermost trailing leaf (a name, a symbol, or a member's name).
 */
const keyOf = (form: CSTNode<any>): Identifier => {
    let node = form;
    while (node.text === null && node.children.length > 0)
        node = node.children[node.children.length - 1]!;
    return node.text as Identifier;
};
