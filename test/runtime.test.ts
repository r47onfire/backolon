import { BackolonVM, Finder, Importer, IndexResolver, Module } from "@r47onfire/backolon";
import { popData } from "@r47onfire/jeb";
import { makeTestRun, run, runAsync } from "@r47onfire/jeb/test";
import { expect, test } from "bun:test";

type VFS = Record<string, string>;

class TestFinder extends Finder {
    match() {
        return this;
    }
    async stat(path: URL) {
        return !!this.vfs[path.href];
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

testTest(test, "comments are empty", async vm => {
    main(vm, "### foo\nfoo");
    expect(await runAsync(vm, MAIN)).toBeTrue();
    const mod = popData(vm) as Module;
    expect(mod).toBeInstanceOf(Module);
    expect(mod.parent).toBeNull();
});

// test("empty result", () => {
//     expectEval("", {
//         t: ThingType.nil,
//     });
// });
// test("trivial return value", () => {
//     expectEval("123\n", {
//         t: ThingType.number,
//         v: 123
//     });
// });
// test("double semicolon suppresses return value", () => {
//     expectEval("'fail';;", {
//         t: ThingType.nil,
//     });
// });
// describe("calling functions", () => {
//     test("'print' prints and returns nil", () => {
//         expect(expectEval("print 1; print (print 2)", {
//             t: ThingType.nil,
//         })).toEqual(["1", "2", "nil"]);
//     });
//     test("sequencing works with newline also instead of semicolons", () => {
//         expect(expectEval("print 1\nprint 2\n", {
//             t: ThingType.nil,
//         })).toEqual(["1", "2"]);
//     });
//     test("call 'print' with 0 arguments prints newline", () => {
//         expect(expectEval("print()", {
//             t: ThingType.nil,
//         })).toEqual([""]);
//     });
//     test("'print' with varargs", () => {
//         expect(expectEval("print 1; print 2, 3; print 4, 5, 6", {
//             t: ThingType.nil,
//         })).toEqual(["1", "2 3", "4 5 6"]);
//     });
// });
// describe("variables", () => {
//     test("declaration return value", () => {
//         expectEval("let a = 1", {
//             t: ThingType.number,
//             v: 1
//         });
//     });
//     test("initialization and retrieval", () => {
//         expect(expectEval("let a = __declare; a b print; b 'test'; b", {
//             t: ThingType.nativefunc,
//             v: "print"
//         })).toEqual(["test"]);
//     });
//     test("redeclaration throws", () => {
//         expectEvalError("let a = nil; let a = nil", "variable \"a\" already exists in this scope");
//     });
//     test("new scopes are not created by inner blocks", () => {
//         expectEvalError("(let a = nil); (let a = nil)", "variable \"a\" already exists in this scope");
//     });
//     test("can only declare a name", () => {
//         expectEvalError("let 1 = 2", "cannot assign to number");
//     });
//     test("declarations override globals", () => {
//         expectEvalError("let print = 1; print 'hi'", "can't call number");
//     });
//     test("reassignment", () => {
//         expect(expectEval("let a = 1; print a; a = 2; print a = 3; a", {
//             t: ThingType.number,
//             v: 3
//         })).toEqual(["1", "3"]);
//     });
//     test("assignment can span multiple lines", () => {
//         expectEval("let a = nil; a =\n3; a", {
//             t: ThingType.number,
//             v: 3
//         });
//     });
//     test("assignment is right associative", () => {
//         expectEval("let a = nil; let b = nil; a = b = 1", {
//             t: ThingType.number,
//             v: 1
//         });
//     });
//     test("assignment requires the variable to exist", () => {
//         expectEvalError("thisWasNotDeclared = 1", "undefined: \"thisWasNotDeclared\"", "note: use \"let\" to declare \"thisWasNotDeclared\" to be in this scope");
//     });
// });
// describe("lambdas", () => {
//     test("create lambdas", () => {
//         expectEval("fn() 1", {
//             t: ThingType.func,
//             v: null,
//         });
//     });
//     test("lambdas get the name of the first thing they're assigned to", () => {
//         expectEval("let foo = fn() 1; let bar = foo; bar", {
//             t: ThingType.func,
//             v: "foo",
//         });
//     });
//     test("'return' exists and is a continuation", () => {
//         expectEval("(fn() return)()", {
//             t: ThingType.continuation,
//         });
//     });
//     test("'return' correctly stops execution and returns the value", () => {
//         expect(expectEval("(fn() return 3; print 1)()", {
//             t: ThingType.number,
//             v: 3
//         })).toEqual([]);
//     });
//     test("closed-over scopes can be accessed and mutated", () => {
//         expectEval("let callWithThree = fn(f) f 3; let outerVariable = nil; callWithThree fn(three) outerVariable = three; outerVariable", {
//             t: ThingType.number,
//             v: 3
//         });
//     });
//     test("lambda default parameters have dynamic scope", () => {
//         expectEval("let x = 4; let f = fn(a=x) a; let x = 3 in f()", {
//             t: ThingType.number,
//             v: 3
//         });
//     });
//     test("lambdas are terminated by a newline like everything else", () => {
//         expect(expectEval("let f = fn(x) print x, 'hi'\nf 1\nf 2", {
//             t: ThingType.nil,
//         })).toEqual(["1 hi", "2 hi"]);
//     });
//     test("lambdas with rest parameters", () => {
//         expect(expectEval("let f = fn(x, y, z...) print x, y, z; f 1, 2; f 1, 2, 3, 4, 5", {
//             t: ThingType.nil,
//         })).toEqual(["1 2 []", "1 2 [3, 4, 5]"]);
//         expectEvalError("fn(x..., y...) 1", "can only have 1 rest parameter");
//     });
//     test("recurson is capped", () => {
//         expectEvalError("let f = fn(x) (x x; x x); f f", "too much recursion");
//         expectEvalError("let f = fn(x) if x > 0 then f x - 1 else g(); let g = fn() f 10; g()", "too much recursion");
//     });
// });
// describe("conditionals", () => {
//     test("if true", () => {
//         expectEval("if true then 'foo' else 'bar' end", {
//             t: ThingType.string,
//             v: "foo"
//         });
//         expectEval("if false then 'foo' else 'bar' end", {
//             t: ThingType.string,
//             v: "bar"
//         });
//     });
//     test("if side effects", () => {
//         expect(expectEval("if true then print 1 else print 2", {
//             t: ThingType.nil,
//         })).toEqual(["1"]);
//         expect(expectEval("if false then print 1 else print 2", {
//             t: ThingType.nil,
//         })).toEqual(["2"]);
//     });
//     test("inline torture test", () => {
//         expectEval("0?1:2?3:4", { t: ThingType.number, v: 3 });
//         expectEval("1?2?3:4:5", { t: ThingType.number, v: 3 });
//         expectEval("x:=1?2:3", { t: ThingType.number, v: 2 });
//     });
// });
// describe("operators", () => {
//     test("add", () => {
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
//     test("sub", () => {
//         expectEval("1 - 2", {
//             t: ThingType.number,
//             v: -1
//         });
//         expectEval("-0.8-8", {
//             t: ThingType.number,
//             v: -8.8
//         });
//     });
//     test("works with assignment", () => {
//         expectEval("x := 1 + 2; x", {
//             t: ThingType.number,
//             v: 3
//         });
//     });
// });
// describe("collections", () => {
//     test("empty collections", () => {
//         expectEval("[]", {
//             t: ThingType.list,
//             c: []
//         });
//         expectEval("[:]", {
//             t: ThingType.map,
//             c: []
//         });
//     });
//     test("one element collections", () => {
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
//     test("self-referential collections", () => {
//         expect(expectEval("x := [0]; x->0 = x; print x", {
//             t: ThingType.nil
//         })).toEqual(["#0=[#0#]"]);
//     });
//     test("multiple element collections", () => {
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
//     test("indexing lists", () => {
//         expectEval("[1, 2, 3]->2", {
//             t: ThingType.number,
//             v: 3,
//         });
//         expectEval("[[1, 2], [3, 4]]->1->1", {
//             t: ThingType.number,
//             v: 4,
//         });
//     });
//     test("indexing maps", () => {
//         expectEval("[1: 2, 3: 4]->3", {
//             t: ThingType.number,
//             v: 4,
//         });
//         expectEvalError("[1: 2, 3: 4]->4", "key 4 not found in map");
//     });
//     test("assigning to list indices", () => {
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
//     test("collections with dynamic values", () => {
//         expectEval("x := 1; [x, x + 1, x + 2]->x", {
//             t: ThingType.number,
//             v: 2,
//         });
//     });
//     test("getting length", () => {
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
//     test("string into string", () => {
//         expectEval("x := 'world'; \"hello {x}!\"", {
//             t: ThingType.string,
//             v: "hello world!",
//         });
//     });
//     test("non-string into string", () => {
//         expectEval("x := 123+456; \"hello {x}!\"", {
//             t: ThingType.string,
//             v: "hello 579!",
//         });
//     });
//     test("literals as-written are unparsed directly", () => {
//         expectEval("x := 0x12323; \"hello {x}!\"", {
//             t: ThingType.string,
//             v: "hello 0x12323!",
//         });
//     });
//     test("single string block convert to string", () => {
//         expectEval("x := 1; \"{x}\"", {
//             t: ThingType.string,
//             v: "1",
//         });
//     });
// });
// describe("homoiconicity", () => {
//     describe("quoting", () => {
//         test("quote of block", () => {
//             expectEval("`(ok bye)", {
//                 t: ThingType.roundblock,
//             });
//         });
//         test("quote of thing that already evaluates to itself", () => {
//             expectEval("`1", {
//                 t: ThingType.number,
//             });
//         });
//         test("double quoting", () => {
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
//         test("quoting name", () => {
//             expectEval("`name", {
//                 t: ThingType.name,
//                 v: "name"
//             });
//         });
//     });
//     describe("templating", () => {
//         test("interpolation into blocks", () => {
//             expect(expectEval("x := print; y := {$x 2}; __eval y; y", {
//                 t: ThingType.roundblock,
//                 c: [
//                     { t: ThingType.nativefunc, v: "print" },
//                     { t: ThingType.space },
//                     { t: ThingType.number, v: 2 },
//                 ]
//             })).toEqual(["2"]);
//         });
//         test("multi-level templating", () => {
//             expect(expectEval("x := 1; print {print $x {print $y 2}}", {
//                 t: ThingType.nil,
//             })).toEqual(["(print 1 {print $y 2})"]);
//         });
//         test("too many quotes error", () => {
//             expectEvalError("{{{$$$$x}}}", "too many unquotes (there are 4 unquotes, but we're only at level 3)", "note: level 3 starts here:");
//         });
//         test("quotes at end error", () => {
//             expectEvalError("{$}", "stray quotes at end");
//         });
//     });
//     describe("eval", () => {
//         test("simple eval in original environment", () => {
//             expect(expectEval("x := `(print 1); eval x", {
//                 t: ThingType.nil,
//             })).toEqual(["1"]);
//         });
//         test("eval in constructed environment", () => {
//             expect(expectEval("x := `(say 1); evalin [`say: [x] => print x x] x", {
//                 t: ThingType.nil,
//             })).toEqual(["1 1"]);
//         });
//         test("concatenation of blocks", () => {
//             expectEval("eval `(1 +) + `(2)", {
//                 t: ThingType.number,
//                 v: 3,
//             });
//         });
//     });
//     test("implicit keys", () => {
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
//     test("A000142 (factorial)", () => {
//         const x = 100;
//         const factorial = (a: bigint): bigint => a > 1 ? a * factorial(a - 1n) : 1n;
//         expectEval(`factorial := [a] => a > 1 ? (a * (factorial a - 1)) : 1; factorial ${x}`, {
//             t: ThingType.number,
//             v: factorial(BigInt(x)),
//         });
//     });
//     test("A000045 (Fibonacci sequence)", () => {
//         const x = 100;
//         const fibonacci = MEMOIZE_F(a => a < 2 ? a : fibonacci(a - 1n) + fibonacci(a - 2n));
//         expectEval(`${MEMOIZE}; fibonacci := (memoize [a] => a < 2 ? a : ((fibonacci a - 1) + (fibonacci a - 2))); fibonacci ${x}`, {
//             t: ThingType.number,
//             v: fibonacci(BigInt(x)),
//         });
//     });
//     test("A005185 (Hofstadter 'Q' sequence)", () => {
//         const x = 80;
//         const q = MEMOIZE_F(a => a < 3 ? 1n : q(a - q(a - 1n)) + q(a - q(a - 2n)));
//         expectEval(`${MEMOIZE}; q := (memoize [a] => a < 3 ? 1 : ((q a - (q a - 1)) + (q a - (q a - 2)))); q ${x}`, {
//             t: ThingType.number,
//             v: Number(q(BigInt(x)))
//         });
//     });
//     test("A063510", () => {
//         const x = 65536;
//         const A063510 = (a: number): number => a < 2 ? 1 : 1 + A063510(a ** 0.5 | 0);
//         expectEval("f := [a] => a < 2 ? 1 : ((f a ** .5 | 0) + 1); f 65536", {
//             t: ThingType.number,
//             v: A063510(x),
//         });
//     });
//     test("list building via splat", () => {
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
