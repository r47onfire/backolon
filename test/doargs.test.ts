import { CSTNode, nothing, parseToCST } from "@r47onfire/nebula";
import { condenseCST } from "@r47onfire/nebula/compile";
import { describe, expect, test } from "bun:test";
import {
    backolonGrammar,
    BackolonVM,
    BTypeError,
    Builtin,
    Env,
    Importer,
    IndexResolver,
    Signature,
    SignatureParam,
    StackEntryKind,
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

const parseProgram = (src: string): CSTNode<any> =>
    condenseCST(
        parseToCST(
            src,
            new URL("test:"),
            0,
            "toplevel_exprs",
            backolonGrammar,
            "exprs",
        ),
    );

/** The argument forms of a call written as source, e.g. "f(1, b: 2)" */
const argsOf = (src: string): CSTNode<any>[] => {
    const call = parseProgram(src).children[0]!;
    return [...call.children.find((c) => c.type === "args")!.children];
};

/** A single expression form written as source, e.g. "9" */
const exprOf = (src: string): CSTNode<any> => parseProgram(src).children[0]!;

/** The text of a node's innermost trailing leaf (a name, a number) */
const leafText = (n: CSTNode<any>): string => {
    while (n.children && n.children.length > 0)
        n = n.children[n.children.length - 1]!;
    return n.text!;
};

const FORM_SIG: Signature<["node"], never, [], never> = {
    head: ["node"],
    tail: [],
    byName: { node: { kind: "normal" } },
};

/**
 * A test grammar whose forms evaluate without the real grammar's handlers:
 * numbers evaluate to their value, names record their evaluation (in `order`)
 * and evaluate to their own text, and a collection evaluates to an array, or to
 * an object when its items are keyword pairs.
 */
const makeGrammar = (order: string[]) =>
    ({
        number: {
            def: nothing(),
            run: new Builtin(
                ((_t: any, _e: any, _tb: any, _h: any, n: CSTNode<any>) =>
                    Number(leafText(n))) as any,
                FORM_SIG,
            ),
        },
        name: {
            def: nothing(),
            run: new Builtin(
                ((_t: any, _e: any, _tb: any, _h: any, n: CSTNode<any>) => {
                    const text = leafText(n);
                    order.push(text);
                    return text;
                }) as any,
                FORM_SIG,
            ),
        },
        collection: {
            def: nothing(),
            run: new Builtin(
                function* (
                    task: Task,
                    env: Env,
                    tb: any,
                    h: any,
                    n: CSTNode<any>,
                ) {
                    if (n.children.some((c) => c.type === "kw")) {
                        const out: Record<string, any> = {};
                        for (const k of n.children)
                            out[leafText(k.children[0]!)] = yield* task.eval(
                                k.children[1]!,
                                env,
                                tb,
                                h,
                                [],
                            );
                        return out;
                    }
                    const out: any[] = [];
                    for (const c of n.children)
                        out.push(yield* task.eval(c, env, tb, h, []));
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
            argsOf("f(1, b: 2, 3)"),
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
            argsOf("f(1, a: 2)"),
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
            argsOf("f(x, b: y, z)"),
            order,
        );
        expect(order).toEqual(["x", "y", "z"]);
        expect(got).toEqual(["x", "y", "z"]);
    });

    test("lazy parameter binds the raw form, unevaluated", () => {
        const order: string[] = [];
        const forms = argsOf("f(x)");
        const got = callForms(sig([["m", { kind: "lazy" }]]), forms, order);
        expect(got[0]).toBe(forms[0]);
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
                argsOf("f(5)"),
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
        const got = callForms(
            sig([["a", N]], { posRest: "rest" }),
            argsOf("f(...[1, 2], 3)"),
        );
        expect(got).toEqual([1, [2, 3]]);
    });

    test("tail claims from the back around a splat", () => {
        const got = callForms(
            sig([["a", N]], { posRest: "rest", tail: [["z", N]] }),
            argsOf("f(1, ...[2, 3], 4)"),
        );
        expect(got).toEqual([1, [2, 3], 4]);
    });

    test("keyword splat claims parameters and collects the rest", () => {
        const got = callForms(
            sig([["a", N]], { kwRest: "kw" }),
            argsOf("f(...:[a: 1, z: 2])"),
        );
        expect(got).toEqual([1, { z: 2 }]);
    });

    test("unfilled optional parameters take their defaults", () => {
        const got = callForms(
            sig([
                ["a", { kind: "normal", opt: true, defaultForm: exprOf("9") }],
                ["b", { kind: "normal", opt: true }],
            ]),
            argsOf("f()"),
        );
        expect(got).toEqual([9, null]);
    });

    test("lazy parameter's default is the default form itself", () => {
        const form = exprOf("d");
        const got = callForms(
            sig([["m", { kind: "lazy", opt: true, defaultForm: form }]]),
            argsOf("f()"),
        );
        expect(got[0]).toBe(form);
    });

    test("hole claims a slot and forces the default", () => {
        const got = callForms(
            sig([
                ["a", N],
                ["b", { kind: "normal", opt: true, defaultForm: exprOf("9") }],
                ["c", N],
            ]),
            argsOf("f(1,,3)"),
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
            callForms(sig([["a", N]]), argsOf("f(a: 1, a: 2)")),
        ).toThrow("backolon.call.duplicate_argument");
    });

    test("unknown keyword", () => {
        expect(() => callForms(sig([["a", N]]), argsOf("f(z: 1)"))).toThrow(
            "backolon.call.unknown_keyword",
        );
    });

    test("missing required argument", () => {
        expect(() => callForms(sig([["a", N]]), argsOf("f()"))).toThrow(
            "backolon.call.missing_argument",
        );
    });

    test("too many arguments early error", () => {
        const order: string[] = [];
        expect(() =>
            callForms(sig([["a", N]]), argsOf("f(x, y)"), order),
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
    describe("tracebacks", () => {
        test("binding errors' tracebacks blame the parameter", () => {
            let caught: unknown;
            try {
                callForms(sig([["a", N]]), argsOf("f(a: 1, a: 2)"));
            } catch (e) {
                caught = e;
            }
            expect(caught).toBeInstanceOf(BTypeError);
            const frame = (caught as BTypeError).traceback?.value;
            if (frame?.leaf) {
                expect(frame.kind).toBe(StackEntryKind.PARAMETER);
                expect(frame.name).toBe("a");
                // the blamed span is the duplicate argument's value
                expect(frame.location.file.href).toBe("test:");
                expect(frame.location.begin).toBe(11);
                expect(frame.location.end).toBe(12);
            } else {
                expect.unreachable();
            }
        });

        test("no argument to blame adds no frame", () => {
            // a missing argument has no form, hence no span, hence no frame:
            // the error keeps the traceback it was raised with (here, none)
            let caught: unknown;
            try {
                callForms(sig([["a", N]]), argsOf("f()"));
            } catch (e) {
                caught = e;
            }
            expect(caught).toBeInstanceOf(BTypeError);
            expect((caught as BTypeError).traceback).toBeNull();
        });
    });
});
