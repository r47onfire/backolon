import { CSTNode, nothing } from "@r47onfire/nebula";
import { describe, expect, test } from "bun:test";
import {
    BackolonVM,
    Builtin,
    Env,
    Importer,
    IndexResolver,
    Signature,
    SignatureParam,
    Task,
    TaskGen,
} from "../src";
import { callValue } from "../src/runtime/call";

/** Drive a generator that never yields a promise to completion. */
const drive = (gen: TaskGen<any>): any => {
    let step = gen.next();
    while (!step.done) step = gen.next();
    return step.value;
};

const span = { begin: 0, end: 0 } as any;
const leaf = (text: string) =>
    new CSTNode<any>(span, null as any, [], false, null, text);
const node = (
    type: string,
    children: CSTNode<any>[] = [],
    text: string | null = null,
) => new CSTNode<any>(span, type, children, false, null, text);
const num = (n: number) => node("num", [], String(n));
const track = (label: string) => node("track", [], label);
const kw = (name: string, value: CSTNode<any>) =>
    node("kw", [node("name", [leaf(name)]), value]);
const splat = (inner: CSTNode<any>) => node("splat", [inner]);
const splatKw = (inner: CSTNode<any>) => node("splat_kw", [inner]);
const arr = (...items: CSTNode<any>[]) => node("arr", items);
const obj = (...items: CSTNode<any>[]) => node("obj", items);
const emptyArg = () => node("empty_arg");

const FORM_SIG: Signature<["node"], never, [], never> = {
    head: ["node"],
    tail: [],
    byName: { node: { kind: "normal" } },
};

/** A test grammar whose forms evaluate without the real grammar's handlers. */
const makeGrammar = (order: string[]) =>
    ({
        num: {
            def: nothing(),
            run: new Builtin(
                ((_t: any, _e: any, _tb: any, _h: any, n: CSTNode<any>) =>
                    Number(n.text)) as any,
                FORM_SIG,
            ),
        },
        track: {
            def: nothing(),
            run: new Builtin(
                ((_t: any, _e: any, _tb: any, _h: any, n: CSTNode<any>) => {
                    order.push(n.text!);
                    return n.text;
                }) as any,
                FORM_SIG,
            ),
        },
        arr: {
            def: nothing(),
            run: new Builtin(
                function* (
                    task: Task,
                    env: Env,
                    tb: any,
                    h: any,
                    n: CSTNode<any>,
                ) {
                    const out: any[] = [];
                    for (const c of n.children)
                        out.push(yield* task.eval(c, env, tb, h, []));
                    return out;
                } as any,
                FORM_SIG,
            ),
        },
        obj: {
            def: nothing(),
            run: new Builtin(
                function* (
                    task: Task,
                    env: Env,
                    tb: any,
                    h: any,
                    n: CSTNode<any>,
                ) {
                    const out: Record<string, any> = {};
                    for (const k of n.children)
                        out[k.children[0]!.children[0]!.text!] =
                            yield* task.eval(k.children[1]!, env, tb, h, []);
                    return out;
                } as any,
                FORM_SIG,
            ),
        },
    }) as any;

const N: SignatureParam = { kind: "normal" };
const sig = (
    head: [string, SignatureParam][],
    opts: {
        posRest?: string;
        tail?: [string, SignatureParam][];
        kwRest?: string;
    } = {},
): Signature => {
    const byName: Record<string, SignatureParam> = {};
    for (const [n, p] of head) byName[n] = p;
    const tail = opts.tail ?? [];
    for (const [n, p] of tail) byName[n] = p;
    if (opts.posRest) byName[opts.posRest] = { kind: "normal" };
    if (opts.kwRest) byName[opts.kwRest] = { kind: "normal" };
    return {
        head: head.map(([n]) => n),
        tail: tail.map(([n]) => n),
        posRest: opts.posRest as any,
        kwRest: opts.kwRest as any,
        byName,
    } as Signature;
};

/** A callee that records the bound arguments it was called with. */
const probe = (s: Signature) => {
    let got: any[] | undefined;
    const callee = new Builtin(
        ((_t: any, _e: any, _tb: any, _h: any, ...args: any[]) => {
            got = args;
            return args;
        }) as any,
        s as any,
    );
    return { callee, got: () => got };
};

const makeTask = (order: string[]) => {
    const vm = new BackolonVM(new Importer(new IndexResolver(), []));
    const task = new Task(vm, "test", 0);
    task.grammar = makeGrammar(order);
    return task;
};

const callForms = (
    s: Signature,
    forms: CSTNode<any>[],
    order: string[] = [],
) => {
    const task = makeTask(order);
    const p = probe(s);
    drive(
        callValue(
            task,
            new Env(),
            null as any,
            null as any,
            p.callee as any,
            undefined,
            forms,
            false,
        ),
    );
    return p.got()!;
};

const callValues = (s: Signature, values: any[]) => {
    const p = probe(s);
    drive(
        callValue(
            null as any,
            null as any,
            null as any,
            null as any,
            p.callee as any,
            undefined,
            values,
            true,
        ),
    );
    return p.got()!;
};

describe("doargs", () => {
    test("bind in signature order", () => {
        const got = callForms(
            sig(
                [
                    ["a", N],
                    ["b", N],
                ],
                { tail: [["c", N]] },
            ),
            [num(1), kw("b", num(2)), num(3)],
        );
        expect(got).toEqual([1, 2, 3]);
    });

    test("positional argument skips a parameter a keyword claimed", () => {
        // the keyword claims `a` in the static pass, so the positional
        // argument -- written first -- lands on `b`
        const got = callForms(
            sig([
                ["a", N],
                ["b", N],
            ]),
            [num(1), kw("a", num(2))],
        );
        expect(got).toEqual([2, 1]);
    });

    test("evaluated in source order", () => {
        const order: string[] = [];
        const got = callForms(
            sig([
                ["a", N],
                ["b", N],
                ["c", N],
            ]),
            [track("1"), kw("b", track("2")), track("3")],
            order,
        );
        expect(order).toEqual(["1", "2", "3"]);
        expect(got).toEqual(["1", "2", "3"]);
    });

    test("lazy parameter binds the raw form, unevaluated", () => {
        const order: string[] = [];
        const form = track("x");
        const got = callForms(sig([["m", { kind: "lazy" }]]), [form], order);
        expect(got[0]).toBe(form);
        expect(order).toEqual([]);
    });

    test("block parameter binds a callable that evaluates the form", () => {
        const order: string[] = [];
        const task = makeTask(order);
        const p = probe(sig([["blk", { kind: "block" }]]));
        drive(
            callValue(
                task,
                new Env(),
                null as any,
                null as any,
                p.callee as any,
                undefined,
                [num(5)],
                false,
            ),
        );
        const block = p.got()![0];
        expect(block).toBeInstanceOf(Builtin);
        const value = drive(
            callValue(
                task,
                new Env(),
                null as any,
                null as any,
                block,
                undefined,
                [],
                true,
            ),
        );
        expect(value).toBe(5);
    });
});
describe("splat args", () => {
    test("splat expands into the positional middle", () => {
        const got = callForms(sig([["a", N]], { posRest: "rest" }), [
            splat(arr(num(1), num(2))),
            num(3),
        ]);
        expect(got).toEqual([1, [2, 3]]);
    });

    test("tail claims from the back around a splat", () => {
        const got = callForms(
            sig([["a", N]], { posRest: "rest", tail: [["z", N]] }),
            [num(1), splat(arr(num(2), num(3))), num(4)],
        );
        expect(got).toEqual([1, [2, 3], 4]);
    });

    test("keyword splat claims parameters and collects the rest", () => {
        const got = callForms(sig([["a", N]], { kwRest: "kw" }), [
            splatKw(obj(kw("a", num(1)), kw("z", num(2)))),
        ]);
        expect(got).toEqual([1, { z: 2 }]);
    });

    test("unfilled optional parameters take their defaults", () => {
        const got = callForms(
            sig([
                ["a", { kind: "normal", opt: true, defaultForm: num(9) }],
                ["b", { kind: "normal", opt: true }],
            ]),
            [],
        );
        expect(got).toEqual([9, null]);
    });

    test("lazy parameter's default is the default form itself", () => {
        const form = track("d");
        const got = callForms(
            sig([["m", { kind: "lazy", opt: true, defaultForm: form }]]),
            [],
        );
        expect(got[0]).toBe(form);
    });

    test("hole claims a slot and forces the default", () => {
        const got = callForms(
            sig([
                ["a", N],
                ["b", { kind: "normal", opt: true, defaultForm: num(9) }],
                ["c", N],
            ]),
            [num(1), emptyArg(), num(3)],
        );
        expect(got).toEqual([1, 9, 3]);
    });

    test("computed values bind positionally", () => {
        const got = callValues(
            sig([["a", N]], {
                posRest: "rest",
                tail: [["z", N]],
                kwRest: "kw",
            }),
            [1, 2, 3],
        );
        expect(got).toEqual([1, [2], 3, {}]);
    });
});
describe("errors", () => {
    test("duplicate keyword", () => {
        expect(() =>
            callForms(sig([["a", N]]), [kw("a", num(1)), kw("a", num(2))]),
        ).toThrow("backolon.call.duplicate_argument");
    });

    test("unknown keyword", () => {
        expect(() => callForms(sig([["a", N]]), [kw("z", num(1))])).toThrow(
            "backolon.call.unknown_keyword",
        );
    });

    test("missing required argument", () => {
        expect(() => callForms(sig([["a", N]]), [])).toThrow(
            "backolon.call.missing_argument",
        );
    });

    test("too many arguments early error", () => {
        const order: string[] = [];
        expect(() =>
            callForms(sig([["a", N]]), [track("1"), track("2")], order),
        ).toThrow("backolon.call.too_many_arguments");
        expect(order).toEqual([]);
    });

    test("computed value cannot fill a lazy parameter", () => {
        expect(() => callValues(sig([["m", { kind: "lazy" }]]), ["x"])).toThrow(
            "backolon.call.lazy_computed",
        );
    });

    test("too many computed values", () => {
        expect(() => callValues(sig([["a", N]]), [1, 2])).toThrow(
            "backolon.call.too_many_arguments",
        );
    });
});
