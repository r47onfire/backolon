import { BackolonVM, Finder, Importer, IndexResolver, Module } from "@r47onfire/backolon";
import { popData } from "@r47onfire/jeb";
import { makeTestRun, runAsync } from "@r47onfire/jeb/test";
import { describe, expect, test } from "bun:test";

type VFS = Record<string, string>;

class TestFinder extends Finder {
    match() {
        return this;
    }
    async stat(path: URL) {
        return this.vfs[path.href] !== undefined;
    }
    async getText(path: URL) {
        return this.vfs[path.href]!;
    }
    vfs: VFS = {};
}

const vfs = (vm: BackolonVM, files: VFS) => {
    Object.assign((vm.importer.finders[0] as TestFinder).vfs, files);
};

const vfsURL = (file: string) => new URL(file, "test://");
const MAIN = vfsURL("main.bk");

const main = (vm: BackolonVM, file: string) => vfs(vm, { [MAIN.href]: file });

const testTest = makeTestRun(class extends BackolonVM { constructor() { super(new Importer(new IndexResolver(), [new TestFinder()])) } });

const expectEval = async (vm: BackolonVM, stdout: string[], src: string, result: any, expectedOut: string[]) => {
    main(vm, src);
    expect(await runAsync(vm, MAIN)).toBeTrue();
    const mod = popData(vm) as Module;
    expect(mod).toBeInstanceOf(Module);
    expect(mod.parent).toBeNull();
    expect(mod.result).toEqual(result);
    expect(stdout).toEqual(expectedOut);
};

const expectEvalError = (vm: BackolonVM, src: string, error: string) => {
    main(vm, src);
    expect(runAsync(vm, MAIN)).rejects.toThrow(error);
}

testTest(test, "call", async (vm, out) => {
    await expectEval(vm, out, "print print 1 + 2 * 3, 4", undefined, ["7 4", "undefined"]);
});

testTest(test, "multiple call arguments", async (vm, out) => {
    await expectEval(vm, out, "print(1, 2)\nprint (1, 2)\nprint 1, 2\nprint()\nprint", vm.builtinsEnv.get("print").throw(), ["1 2", "1 2", "1 2", ""]);
});

testTest(test, "associativity", async (vm, out) => {
    await expectEval(vm, out, "print(1 + 2 + 3)\nprint(2 ** 3 ** 2)", undefined, ["6", "512"]);
});
testTest(test, "empty result", async (vm, out) => {
    await expectEval(vm, out, "", undefined, []);
});
testTest(test, "trivial return value", async (vm, out) => {
    await expectEval(vm, out, "123", 123, []);
});
testTest(test, "semicolon terminates implicit calls", async (vm, out) => {
    await expectEval(vm, out, "print 1; print 2", undefined, ["1", "2"]);
});
testTest(test, "separators insert missing call arguments", async (vm, out) => {
    await expectEval(vm, out, "print(,); print(1,,2);", undefined, ["undefined", "1 undefined 2"]);
});
testTest(test, "consecutive semicolons are allowed", async (vm, out) => {
    await expectEval(vm, out, "print 1;;;;;;;;;print 2", undefined, ["1", "2"]);
});
describe("calling functions", () => {
    testTest(test, "'print' prints and returns undefined", async (vm, out) => {
        await expectEval(vm, out, "print 1; print (print 2)", undefined, ["1", "2", "undefined"]);
    });
    testTest(test, "sequencing works with newline also instead of semicolons", async (vm, out) => {
        await expectEval(vm, out, "print 1\nprint 2\n", undefined, ["1", "2"]);
    });
    testTest(test, "call 'print' with 0 arguments prints newline", async (vm, out) => {
        await expectEval(vm, out, "print()", undefined, [""]);
    });
    testTest(test, "'print' with varargs", async (vm, out) => {
        await expectEval(vm, out, "print 1; print 2, 3; print 4, 5, 6", undefined, ["1", "2 3", "4 5 6"]);
    });
});
describe("variables", () => {
    testTest(test, "declaration return value", async (vm, out) => {
        await expectEval(vm, out, "let a = 1", 1, []);
    });
    testTest(test, "redeclaration does not throw", async (vm, out) => {
        await expectEval(vm, out, "let a = 1; print a; let a = 2; print a;", undefined, ["1", "2"]);
    });
    testTest(test, "new scopes are not created by inner blocks", async (vm, out) => {
        await expectEval(vm, out, "(let a = 1; print a); (a = 2; print a);", undefined, ["1", "2"]);
    });
    testTest(test, "can only declare a name", vm => {
        expectEvalError(vm, "let 1 = 2", "invalid let binding");
    });
    testTest(test, "declarations override globals", vm => {
        expectEvalError(vm, "let print = 1; print 'hi'", "can't call number");
    });
    // testTest(test, "reassignment", async (vm, out) => {
    //     expect(expectEval("let a = 1; print a; a = 2; print a = 3; a", {
    //         t: ThingType.number,
    //         v: 3
    //     })).toEqual(["1", "3"]);
    // });
    // testTest(test, "assignment can span multiple lines", async (vm, out) => {
    //     expectEval("let a = nil; a =\n3; a", {
    //         t: ThingType.number,
    //         v: 3
    //     });
    // });
    // testTest(test, "assignment is right associative", async (vm, out) => {
    //     expectEval("let a = nil; let b = nil; a = b = 1", {
    //         t: ThingType.number,
    //         v: 1
    //     });
    // });
    // testTest(test, "assignment requires the variable to exist", async (vm, out) => {
    //     expectEvalError("thisWasNotDeclared = 1", "undefined: \"thisWasNotDeclared\"", "note: use \"let\" to declare \"thisWasNotDeclared\" to be in this scope");
    // });
});
// describe("lambdas", () => {
//     testTest(test, "create lambdas", async (vm, out) => {
//         expectEval("fn() 1", {
//             t: ThingType.func,
//             v: null,
//         });
//     });
//     testTest(test, "lambdas get the name of the first thing they're assigned to", async (vm, out) => {
//         expectEval("let foo = fn() 1; let bar = foo; bar", {
//             t: ThingType.func,
//             v: "foo",
//         });
//     });
//     testTest(test, "'return' exists and is a continuation", async (vm, out) => {
//         expectEval("(fn() return)()", {
//             t: ThingType.continuation,
//         });
//     });
//     testTest(test, "'return' correctly stops execution and returns the value", async (vm, out) => {
//         expect(expectEval("(fn() return 3; print 1)()", {
//             t: ThingType.number,
//             v: 3
//         })).toEqual([]);
//     });
//     testTest(test, "closed-over scopes can be accessed and mutated", async (vm, out) => {
//         expectEval("let callWithThree = fn(f) f 3; let outerVariable = nil; callWithThree fn(three) outerVariable = three; outerVariable", {
//             t: ThingType.number,
//             v: 3
//         });
//     });
//     testTest(test, "lambda default parameters have dynamic scope", async (vm, out) => {
//         expectEval("let x = 4; let f = fn(a=x) a; let x = 3 in f()", {
//             t: ThingType.number,
//             v: 3
//         });
//     });
//     testTest(test, "lambdas are terminated by a newline like everything else", async (vm, out) => {
//         expect(expectEval("let f = fn(x) print x, 'hi'\nf 1\nf 2", {
//             t: ThingType.nil,
//         })).toEqual(["1 hi", "2 hi"]);
//     });
//     testTest(test, "lambdas with rest parameters", async (vm, out) => {
//         expect(expectEval("let f = fn(x, y, z...) print x, y, z; f 1, 2; f 1, 2, 3, 4, 5", {
//             t: ThingType.nil,
//         })).toEqual(["1 2 []", "1 2 [3, 4, 5]"]);
//         expectEvalError("fn(x..., y...) 1", "can only have 1 rest parameter");
//     });
//     testTest(test, "recurson is capped", async (vm, out) => {
//         expectEvalError("let f = fn(x) (x x; x x); f f", "too much recursion");
//         expectEvalError("let f = fn(x) if x > 0 then f x - 1 else g(); let g = fn() f 10; g()", "too much recursion");
//     });
// });
// describe("conditionals", () => {
//     testTest(test, "if true", async (vm, out) => {
//         expectEval("if true then 'foo' else 'bar' end", {
//             t: ThingType.string,
//             v: "foo"
//         });
//         expectEval("if false then 'foo' else 'bar' end", {
//             t: ThingType.string,
//             v: "bar"
//         });
//     });
//     testTest(test, "if side effects", async (vm, out) => {
//         expect(expectEval("if true then print 1 else print 2", {
//             t: ThingType.nil,
//         })).toEqual(["1"]);
//         expect(expectEval("if false then print 1 else print 2", {
//             t: ThingType.nil,
//         })).toEqual(["2"]);
//     });
//     testTest(test, "inline torture test", async (vm, out) => {
//         expectEval("0?1:2?3:4", { t: ThingType.number, v: 3 });
//         expectEval("1?2?3:4:5", { t: ThingType.number, v: 3 });
//         expectEval("x:=1?2:3", { t: ThingType.number, v: 2 });
//     });
// });
// describe("operators", () => {
//     testTest(test, "add", async (vm, out) => {
//         expectEval("1 + 2", {
//             t: ThingType.number,
//             v: 3
//         });
//         expectEval("1000000000000000000000 + 1", {
//             t: ThingType.number,
//             v: 1000000000000000000001n
//         });
//         expectEval("100000000000000000000000000 + 100000000000000000000000000", {
//             t: ThingType.number,
//             v: 200000000000000000000000000n
//         });
//         expectEval("'hello' + 'world'", {
//             t: ThingType.string,
//             v: "helloworld",
//         });
//         expectEval("'hello' + ', ' + 'world' + '!'", {
//             t: ThingType.string,
//             v: "hello, world!",
//         });
//         expectEvalError("'hello' + 1", "No overload exists for operator \"add\" with argument types \"string\", \"number\"");
//         expectEvalError("8**88**88", /out of memory|size exceeded/i);
//     });
//     testTest(test, "sub", async (vm, out) => {
//         expectEval("1 - 2", {
//             t: ThingType.number,
//             v: -1
//         });
//         expectEval("-0.8-8", {
//             t: ThingType.number,
//             v: -8.8
//         });
//     });
//     testTest(test, "works with assignment", async (vm, out) => {
//         expectEval("x := 1 + 2; x", {
//             t: ThingType.number,
//             v: 3
//         });
//     });
// });
// describe("collections", () => {
//     testTest(test, "empty collections", async (vm, out) => {
//         expectEval("[]", {
//             t: ThingType.list,
//             c: []
//         });
//         expectEval("[:]", {
//             t: ThingType.map,
//             c: []
//         });
//     });
//     testTest(test, "one element collections", async (vm, out) => {
//         expectEval("[1]", {
//             t: ThingType.list,
//             c: [{
//                 t: ThingType.number,
//                 v: 1
//             }]
//         });
//         expectEval("[1:2]", {
//             t: ThingType.map,
//             c: [{
//                 t: ThingType.pair,
//                 c: [
//                     {
//                         t: ThingType.number,
//                         v: 1,
//                     },
//                     {
//                         t: ThingType.number,
//                         v: 2
//                     }
//                 ]
//             }]
//         });
//     });
//     testTest(test, "self-referential collections", async (vm, out) => {
//         expect(expectEval("x := [0]; x->0 = x; print x", {
//             t: ThingType.nil
//         })).toEqual(["#0=[#0#]"]);
//     });
//     testTest(test, "multiple element collections", async (vm, out) => {
//         expectEval("[1, 2]", {
//             t: ThingType.list,
//             c: [
//                 {
//                     t: ThingType.number,
//                     v: 1,
//                 },
//                 {
//                     t: ThingType.number,
//                     v: 2,
//                 }
//             ]
//         });
//         // TODO: this fails when the hash algo changes, because maps are unpredictable order
//         expectEval("[1: 2, 3: 4]", {
//             t: ThingType.map,
//             c: [
//                 {
//                     t: ThingType.pair,
//                     c: [
//                         {
//                             t: ThingType.number,
//                             v: 3,
//                         },
//                         {
//                             t: ThingType.number,
//                             v: 4,
//                         }
//                     ]
//                 },
//                 {
//                     t: ThingType.pair,
//                     c: [
//                         {
//                             t: ThingType.number,
//                             v: 1,
//                         },
//                         {
//                             t: ThingType.number,
//                             v: 2,
//                         }
//                     ]
//                 }
//             ]
//         });
//         expectEvalError("[1, 2, 3: 4]", "No overload exists for operator \"add\" with argument types \"list\", \"map\"");
//     });
//     testTest(test, "indexing lists", async (vm, out) => {
//         expectEval("[1, 2, 3]->2", {
//             t: ThingType.number,
//             v: 3,
//         });
//         expectEval("[[1, 2], [3, 4]]->1->1", {
//             t: ThingType.number,
//             v: 4,
//         });
//     });
//     testTest(test, "indexing maps", async (vm, out) => {
//         expectEval("[1: 2, 3: 4]->3", {
//             t: ThingType.number,
//             v: 4,
//         });
//         expectEvalError("[1: 2, 3: 4]->4", "key 4 not found in map");
//     });
//     testTest(test, "assigning to list indices", async (vm, out) => {
//         expectEval("x := [1, 2, 3]; x->1 = 42; x", {
//             t: ThingType.list,
//             c: [
//                 {
//                     t: ThingType.number,
//                     v: 1,
//                 },
//                 {
//                     t: ThingType.number,
//                     v: 42,
//                 },
//                 {
//                     t: ThingType.number,
//                     v: 3,
//                 }
//             ]
//         });
//         expectEval("x := [1, 2, 3]; x->1 = x->2; x", {
//             t: ThingType.list,
//             c: [
//                 {
//                     t: ThingType.number,
//                     v: 1,
//                 },
//                 {
//                     t: ThingType.number,
//                     v: 3,
//                 },
//                 {
//                     t: ThingType.number,
//                     v: 3,
//                 }
//             ]
//         });
//     });
//     testTest(test, "collections with dynamic values", async (vm, out) => {
//         expectEval("x := 1; [x, x + 1, x + 2]->x", {
//             t: ThingType.number,
//             v: 2,
//         });
//     });
//     testTest(test, "getting length", async (vm, out) => {
//         expectEval("x := [1, 2, 3]; #x", {
//             t: ThingType.number,
//             v: 3
//         });
//         expectEval("x := [1: 2, 2: 3, 3: 4]; #x", {
//             t: ThingType.number,
//             v: 3
//         });
//         expectEval("x := 'hello'; #x", {
//             t: ThingType.number,
//             v: 5
//         });
//     });
// });
// describe("string interpolation", () => {
//     testTest(test, "string into string", async (vm, out) => {
//         expectEval("x := 'world'; \"hello {x}!\"", {
//             t: ThingType.string,
//             v: "hello world!",
//         });
//     });
//     testTest(test, "non-string into string", async (vm, out) => {
//         expectEval("x := 123+456; \"hello {x}!\"", {
//             t: ThingType.string,
//             v: "hello 579!",
//         });
//     });
//     testTest(test, "literals as-written are unparsed directly", async (vm, out) => {
//         expectEval("x := 0x12323; \"hello {x}!\"", {
//             t: ThingType.string,
//             v: "hello 0x12323!",
//         });
//     });
//     testTest(test, "single string block convert to string", async (vm, out) => {
//         expectEval("x := 1; \"{x}\"", {
//             t: ThingType.string,
//             v: "1",
//         });
//     });
// });
// describe("homoiconicity", () => {
//     describe("quoting", () => {
//         testTest(test, "quote of block", async (vm, out) => {
//             expectEval("`(ok bye)", {
//                 t: ThingType.roundblock,
//             });
//         });
//         testTest(test, "quote of thing that already evaluates to itself", async (vm, out) => {
//             expectEval("`1", {
//                 t: ThingType.number,
//             });
//         });
//         testTest(test, "double quoting", async (vm, out) => {
//             expectEval("``(ok)", {
//                 t: ThingType.apply,
//                 c: [
//                     {
//                         t: ThingType.nativefunc,
//                         v: "__quote",
//                     },
//                     {
//                         t: ThingType.roundblock
//                     }
//                 ]
//             });
//         });
//         testTest(test, "quoting name", async (vm, out) => {
//             expectEval("`name", {
//                 t: ThingType.name,
//                 v: "name"
//             });
//         });
//     });
//     describe("templating", () => {
//         testTest(test, "interpolation into blocks", async (vm, out) => {
//             expect(expectEval("x := print; y := {$x 2}; __eval y; y", {
//                 t: ThingType.roundblock,
//                 c: [
//                     { t: ThingType.nativefunc, v: "print" },
//                     { t: ThingType.space },
//                     { t: ThingType.number, v: 2 },
//                 ]
//             })).toEqual(["2"]);
//         });
//         testTest(test, "multi-level templating", async (vm, out) => {
//             expect(expectEval("x := 1; print {print $x {print $y 2}}", {
//                 t: ThingType.nil,
//             })).toEqual(["(print 1 {print $y 2})"]);
//         });
//         testTest(test, "too many quotes error", async (vm, out) => {
//             expectEvalError("{{{$$$$x}}}", "too many unquotes (there are 4 unquotes, but we're only at level 3)", "note: level 3 starts here:");
//         });
//         testTest(test, "quotes at end error", async (vm, out) => {
//             expectEvalError("{$}", "stray quotes at end");
//         });
//     });
//     describe("eval", () => {
//         testTest(test, "simple eval in original environment", async (vm, out) => {
//             expect(expectEval("x := `(print 1); eval x", {
//                 t: ThingType.nil,
//             })).toEqual(["1"]);
//         });
//         testTest(test, "eval in constructed environment", async (vm, out) => {
//             expect(expectEval("x := `(say 1); evalin [`say: [x] => print x x] x", {
//                 t: ThingType.nil,
//             })).toEqual(["1 1"]);
//         });
//         testTest(test, "concatenation of blocks", async (vm, out) => {
//             expectEval("eval `(1 +) + `(2)", {
//                 t: ThingType.number,
//                 v: 3,
//             });
//         });
//     });
//     testTest(test, "implicit keys", async (vm, out) => {
//         // TODO: this is a map again, if hash changes the order may be wrong
//         expectEval("x := 1; y := 2; [`x:, `y:]", {
//             t: ThingType.map,
//             c: [
//                 {
//                     t: ThingType.pair,
//                     c: [
//                         {
//                             t: ThingType.name,
//                             v: "x",
//                         },
//                         {
//                             t: ThingType.number,
//                             v: 1,
//                         }
//                     ]
//                 },
//                 {
//                     t: ThingType.pair,
//                     c: [
//                         {
//                             t: ThingType.name,
//                             v: "y",
//                         },
//                         {
//                             t: ThingType.number,
//                             v: 2,
//                         }
//                     ]
//                 }
//             ]
//         });
//     });
// });
// describe("recursion stress tests with memoization", () => {
//     const MEMOIZE = "memoize := [f] => (cache := [:]; [x] => (x <: cache ? cache->x : (cache->x = (f x))))";
//     const MEMOIZE_F = (f: (a: bigint) => bigint) => { const cache: Record<string, bigint> = {}; return (a: bigint) => (cache["" + a] ??= f(a)); }
//     testTest(test, "A000142 (factorial)", async (vm, out) => {
//         const x = 100;
//         const factorial = (a: bigint): bigint => a > 1 ? a * factorial(a - 1n) : 1n;
//         expectEval(`factorial := [a] => a > 1 ? (a * (factorial a - 1)) : 1; factorial ${x}`, {
//             t: ThingType.number,
//             v: factorial(BigInt(x)),
//         });
//     });
//     testTest(test, "A000045 (Fibonacci sequence)", async (vm, out) => {
//         const x = 100;
//         const fibonacci = MEMOIZE_F(a => a < 2 ? a : fibonacci(a - 1n) + fibonacci(a - 2n));
//         expectEval(`${MEMOIZE}; fibonacci := (memoize [a] => a < 2 ? a : ((fibonacci a - 1) + (fibonacci a - 2))); fibonacci ${x}`, {
//             t: ThingType.number,
//             v: fibonacci(BigInt(x)),
//         });
//     });
//     testTest(test, "A005185 (Hofstadter 'Q' sequence)", async (vm, out) => {
//         const x = 80;
//         const q = MEMOIZE_F(a => a < 3 ? 1n : q(a - q(a - 1n)) + q(a - q(a - 2n)));
//         expectEval(`${MEMOIZE}; q := (memoize [a] => a < 3 ? 1 : ((q a - (q a - 1)) + (q a - (q a - 2)))); q ${x}`, {
//             t: ThingType.number,
//             v: Number(q(BigInt(x)))
//         });
//     });
//     testTest(test, "A063510", async (vm, out) => {
//         const x = 65536;
//         const A063510 = (a: number): number => a < 2 ? 1 : 1 + A063510(a ** 0.5 | 0);
//         expectEval("f := [a] => a < 2 ? 1 : ((f a ** .5 | 0) + 1); f 65536", {
//             t: ThingType.number,
//             v: A063510(x),
//         });
//     });
//     testTest(test, "list building via splat", async (vm, out) => {
//         const x = 8;
//         expectEval(`f := [a n] => n > 0 ? [...(f a n - 1), ...(f a n - 1)] : [a]; f 1 ${x}`, {
//             t: ThingType.list,
//             c: new Array(2 ** x).fill({
//                 t: ThingType.number,
//                 v: 1
//             }),
//         });
//     });
// });
