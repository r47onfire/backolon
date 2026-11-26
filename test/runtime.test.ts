import { parseToCST } from "@r47onfire/nebula";
import { condenseCST } from "@r47onfire/nebula/compile";
import { describe, expect, test } from "bun:test";
import {
    BackolonErrorMessageKey,
    backolonGrammar,
    BackolonVM,
    Importer,
    IndexResolver,
    Module,
} from "../src";
import { ARGUMENTS_SIG, Builtin } from "../src/obj/builtin_function";
import { Finder } from "../src/runtime/modules/finder";

type VFS = Record<string, string>;

class TestFinder extends Finder {
    match(url: URL) {
        return this;
    }
    *stat(task: any, env: any, traceback: any, handlers: any, path: URL) {
        return this.vfs[path.href] !== undefined;
    }
    *getText(task: any, env: any, traceback: any, handlers: any, path: URL) {
        return this.vfs[path.href]!;
    }
    vfs: VFS = {};
}

const vfs = (vm: BackolonVM, files: VFS) => {
    Object.assign((vm.importer.finders[0] as TestFinder).vfs, files);
};

const vfsURL = (file: string) => new URL(file, "test:///");
const MAIN = vfsURL("main.bk");

const main = (vm: BackolonVM, file: string) => vfs(vm, { [MAIN.href]: file });

/** Parse source text the way the module loader does. */
const parseSource = (src: string) =>
    condenseCST(
        parseToCST(src, MAIN, 0, "toplevel_exprs", backolonGrammar, "exprs"),
    );

/** How the test print renders a value, line by line. */
const showValue = (value: any): string =>
    value === undefined ? "undefined" : value === null ? "null" : String(value);

/**
 * A VM for tests: its builtins module defines a `print` that appends to
 * {@link out} instead of writing anywhere, so tests can assert on what a program
 * printed.
 */
class TestVM extends BackolonVM {
    out: string[] = [];
    print: Builtin<any>;
    constructor() {
        super(new Importer(new IndexResolver(), [new TestFinder()]));
        this.print = new Builtin(
            (_task: any, _env: any, _traceback: any, _handlers: any, args) => {
                this.out.push(args.map(showValue).join(" "));
                return undefined;
            },
            ARGUMENTS_SIG,
        );
        const builtins = new Module([], vfsURL("builtins.bk"), null);
        builtins.addUnshadowableFast("print", this.print);
        this.builtins = builtins;
    }
    /**
     * Evaluate source text in a fresh module environment and return its value,
     * synchronously (this is {@link BackolonVM.call} over the parsed form).
     * `bindings` pre-populates the environment, for tests of name lookup and
     * interpolation.
     */
    evalStr(src: string, bindings?: Record<string, any>): any {
        const mod = this.createAndCacheModule(vfsURL("eval.bk"), null);
        if (bindings) {
            for (const [name, value] of Object.entries(bindings)) {
                mod.bindings.set(name, value);
            }
        }
        return this.call(parseSource(src), mod);
    }
}

const testTest = (
    testFn: typeof test,
    name: string,
    fn: (vm: TestVM, out: string[]) => void | Promise<void>,
) =>
    testFn(name, () => {
        const vm = new TestVM();
        fn(vm, vm.out);
    });

/**
 * Evaluate `src`, expecting the given result value and printed lines. The
 * printed lines are consumed, so one VM can run several programs.
 */
const expectEval = (
    vm: TestVM,
    src: string,
    result: any,
    expectedOut: string[],
) => {
    expect(vm.evalStr(src)).toEqual(result);
    expect(vm.out).toEqual(expectedOut);
    vm.out.length = 0;
};

const expectEvalError = (vm: TestVM, src: string, error: BackolonErrorMessageKey | RegExp) => {
    expect(() => vm.evalStr(src)).toThrow(error);
};

describe("modules", () => {
    testTest(test, "startThread with source runs a module", (vm) => {
        const task = vm.startThread(vfsURL("repl.bk"), "123");
        vm.waitForAll();
        expect(task.done).toBeTrue();
        expect(task.result).toBeInstanceOf(Module);
        expect(task.result.parent).toBeNull();
    });

    testTest(test, "startThread loads a module through the finder", (vm) => {
        main(vm, "123");
        const task = vm.startThread(MAIN);
        vm.waitForAll();
        expect(task.done).toBeTrue();
        expect(task.result).toBeInstanceOf(Module);
        expect(task.result.parent).toBeNull();
    });
});

describe("eval", () => {
    testTest(test, "number literals", (vm) => {
        expectEval(vm, "123", 123, []);
        expectEval(vm, "1.5", 1.5, []);
        expectEval(vm, "0.1", 0.1, []);
        expectEval(vm, "1e3", 1000, []);
        expectEval(vm, "0x12323", 0x12323, []);
        expectEval(vm, "0b101", 0b101, []);
        // too big for a double to hold exactly: stays a bigint
        expectEval(
            vm,
            "1000000000000000000000000000000",
            1000000000000000000000000000000n,
            [],
        );
    });

    testTest(test, "boolean literals", (vm) => {
        expectEval(vm, "true", true, []);
        expectEval(vm, "True", true, []);
        expectEval(vm, "TRUE", true, []);
        expectEval(vm, "false", false, []);
        expectEval(vm, "False", false, []);
        expectEval(vm, "FALSE", false, []);
    });

    testTest(test, "raw strings take escapes literally", (vm) => {
        expectEval(vm, "'hello'", "hello", []);
        expectEval(vm, "'it\\'s'", "it's", []);
        // a raw string's backslash is simply dropped before the next char
        expectEval(vm, "'a\\nb'", "anb", []);
    });

    testTest(test, "interpolated strings process escapes", (vm) => {
        expectEval(vm, '"hello"', "hello", []);
        expectEval(vm, '"a\\nb"', "a\nb", []);
        expectEval(vm, '"\\x41\\u0042\\U{43}"', "\x41\u0042\U{43}", []);
        expectEval(vm, '"\\a"', "\x07", []);
    });

    testTest(test, "interpolation evaluates and stringifies", (vm) => {
        expectEval(vm, '"\\(123)"', "123", []);
        expectEval(vm, "\"\\('a')b\"", "ab", []);
        expect(vm.evalStr('"x is \\(x)"', { x: 41 })).toBe("x is 41");
    });

    testTest(test, "regex literals", (vm) => {
        const re = vm.evalStr("/ab+c/gi");
        expect(re).toBeInstanceOf(RegExp);
        expect(re.source).toBe("ab+c");
        expect(re.flags).toBe("gi");
        expect(vm.out).toEqual([]);
    });

    testTest(test, "parentheses and sequencing", (vm) => {
        expectEval(vm, "(123)", 123, []);
        expectEval(vm, "(('a'; 'b'))", "b", []);
        expectEval(vm, "1; 2; 3", 3, []);
        expectEval(vm, "1\n2\n3", 3, []);
        expectEval(vm, "## a comment\n123", 123, []);
    });

    testTest(test, "names resolve in the environment", (vm) => {
        expect(vm.evalStr("x", { x: 41 })).toBe(41);
        expectEvalError(vm, "y", "backolon.variable.nonexistent");
        expectEvalError(vm, "null", "backolon.variable.nonexistent");
    });
});

testTest(test, "call", (vm) => {
    expectEval(vm, "print print 1 + 2 * 3, 4", undefined, ["7 4", "undefined"]);
});

testTest(test, "multiple call arguments", (vm, out) => {
    const result = vm.evalStr(
        "print(1, 2)\nprint (1, 2)\nprint 1, 2\nprint()\nprint",
    );
    expect(result).toBe(vm.print);
    expect(out).toEqual(["1 2", "1 2", "1 2", ""]);
});

testTest(test, "associativity", (vm) => {
    expectEval(vm, "print(1 + 2 + 3)\nprint(2 ** 3 ** 2)", undefined, [
        "6",
        "5",
    ]);
});
testTest(test.todo, "empty result", (vm) => {
    expectEval(vm, "", null, []);
});
testTest(test, "trivial return value", (vm) => {
    expectEval(vm, "123", 123, []);
});
testTest(test, "semicolon terminates implicit calls", (vm) => {
    expectEval(vm, "print 1; print 2", undefined, ["1", "2"]);
});
testTest(test, "separators insert missing call arguments", (vm) => {
    expectEval(vm, "print(,); print(1,,2);", undefined, [
        "undefined",
        "1 undefined 2",
    ]);
});
testTest(test, "consecutive semicolons are allowed", (vm) => {
    expectEval(vm, "print 1;;;;;;;;;print 2", undefined, ["1", "2"]);
});
describe("calling functions", () => {
    testTest(test, "'print' prints and returns undefined", (vm) => {
        expectEval(vm, "print 1; print (print 2)", undefined, [
            "1",
            "2",
            "undefined",
        ]);
    });
    testTest(
        test,
        "sequencing works with newline also instead of semicolons",
        (vm) => {
            expectEval(vm, "print 1\nprint 2\n", undefined, ["1", "2"]);
        },
    );
    testTest(test, "call 'print' with 0 arguments prints newline", (vm) => {
        expectEval(vm, "print()", undefined, [""]);
    });
    testTest(test, "'print' with varargs", (vm) => {
        expectEval(vm, "print 1; print 2, 3; print 4, 5, 6", undefined, [
            "1",
            "2 3",
            "4 5 6",
        ]);
    });
});
describe("variables", () => {
    testTest(test, "declaration return value", (vm) => {
        expectEval(vm, "let a = 1", 1, []);
    });
    testTest(test, "redeclaration does not throw", (vm) => {
        expectEval(vm, "let a = 1; print a; let a = 2; print a;", undefined, [
            "1",
            "2",
        ]);
    });
    testTest(test, "new scopes are not created by inner blocks", (vm) => {
        expectEval(vm, "(let a = 1; print a); (a = 2; print a);", undefined, [
            "1",
            "2",
        ]);
    });
    testTest(test, "can only declare a name", (vm) => {
        expectEvalError(
            vm,
            "let 1 = 2",
            "backolon.variable.invalid_declaration",
        );
    });
    testTest(test, "declarations override globals", (vm) => {
        expectEvalError(
            vm,
            "let print = 1; print 1",
            "backolon.eval.not_callable",
        );
    });
    testTest(test, "reassignment", (vm) => {
        expectEval(vm, "let a = 1; print a; a = 2; print a = 3; a", 3, [
            "1",
            "3",
        ]);
    });
    testTest(test, "assignment can span multiple lines", (vm) => {
        expectEval(vm, "let a = 0; a =\n3; a", 3, []);
    });
    testTest(test, "assignment is right associative", (vm) => {
        expectEval(vm, "let a = 0; let b = 0; a = b = 1", 1, []);
        expectEval(vm, "let a = 0; let b = 0; a = b = 1; b", 1, []);
    });
    testTest(test, "assignment requires the variable to exist", (vm) => {
        expectEvalError(
            vm,
            "thisWasNotDeclared = 1",
            "backolon.variable.nonexistent",
        );
    });
});
describe("lambdas", () => {
    testTest(test, "create and call lambdas", (vm) => {
        expectEval(vm, "(fn() 1 end)()", 1, []);
        expectEval(vm, "let f = fn(x) x end; f 41", 41, []);
    });
    testTest(test, "'return' stops execution and returns the value", (vm) => {
        expectEval(vm, "(fn() return 3; print 1 end)()", 3, []);
    });
    testTest(test, "closed-over scopes can be accessed and mutated", (vm) => {
        expectEval(
            vm,
            "let callWithThree = fn(f) f 3 end; let outer = 0; callWithThree fn(three) outer = three end; outer",
            3,
            [],
        );
    });
    testTest(test, "lambda default parameters", (vm) => {
        expectEval(vm, "let f = fn(a = 3) a end; f()", 3, []);
        expectEval(vm, "let f = fn(a = 3) a end; f 4", 4, []);
    });
    testTest(
        test,
        "lambdas are terminated by a newline like everything else",
        (vm) => {
            expectEval(
                vm,
                "let f = fn(x) print x, 'hi' end\nf 1\nf 2",
                undefined,
                ["1 hi", "2 hi"],
            );
        },
    );
});
describe("conditionals", () => {
    testTest(test, "if true and if false", (vm) => {
        expectEval(vm, "if true then 'foo' else 'bar' end", "foo", []);
        expectEval(vm, "if false then 'foo' else 'bar' end", "bar", []);
    });
    testTest(test, "if side effects", (vm) => {
        expectEval(vm, "if true then print 1 else print 2 end", undefined, [
            "1",
        ]);
        expectEval(vm, "if false then print 1 else print 2 end", undefined, [
            "2",
        ]);
    });
    testTest(test, "inline torture test", (vm) => {
        expectEval(vm, "0?1:2?3:4", 3, []);
        expectEval(vm, "1?2?3:4:5", 3, []);
        expectEval(vm, "let x = 1?2:3; x", 2, []);
    });
});
describe("operators", () => {
    testTest(test, "add", (vm) => {
        expectEval(vm, "1 + 2", 3, []);
        expectEval(
            vm,
            "1000000000000000000000000000000 + 1",
            1000000000000000000000000000001n,
            [],
        );
        expectEval(vm, "'hello' + 'world'", "helloworld", []);
        expectEval(vm, "'hello' + ', ' + 'world' + '!'", "hello, world!", []);
    });
    testTest(test, "add with wrong types errors", (vm) => {
        expectEvalError(
            vm,
            "'hello' + 1",
            "backolon.operator.binary.wrong_type",
        );
    });
    testTest(test, "sub", (vm) => {
        expectEval(vm, "1 - 2", -1, []);
        expectEval(vm, "-0.8 - 8", -8.8, []);
    });
    testTest(test, "works with assignment", (vm) => {
        expectEval(vm, "let x = 1 + 2; x", 3, []);
    });
});
describe("collections", () => {
    testTest(test, "empty collections", (vm) => {
        expectEval(vm, "[]", [], []);
    });
    testTest(test, "list literals are arrays", (vm) => {
        expectEval(vm, "[1]", [1], []);
        expectEval(vm, "[1, 2]", [1, 2], []);
        expectEval(
            vm,
            "[[1, 2], [3, 4]]",
            [
                [1, 2],
                [3, 4],
            ],
            [],
        );
    });
    testTest(test, "map literals are objects", (vm) => {
        expectEval(vm, "[1: 2]", { "1": 2 }, []);
        expectEval(vm, "[1: 2, 3: 4]", { "1": 2, "3": 4 }, []);
    });
    testTest(test, "collections with dynamic values", (vm) => {
        expectEval(vm, "let x = 4; [x, x + 1, x + 2]", [4, 5, 6], []);
    });
    testTest(test.todo, "self-referential collections", (vm) => {
        expectEval(vm, "let x = [0]; x.(0) = x; print x", undefined, [
            "#0=[#0#]",
        ]);
    });
    testTest(test, "indexing lists", (vm) => {
        expectEval(vm, "[1, 2, 3].(2)", 3, []);
        expectEval(vm, "[[1, 2], [3, 4]].(1).(1)", 4, []);
        expectEval(vm, "let x = 1; [x, x + 1, x + 2].(x)", 2, []);
    });
    testTest(test, "indexing maps", (vm) => {
        expectEval(vm, "[1: 2, 3: 4].(3)", 4, []);
        expectEval(vm, "[1: 2, 3: 4].(4)", undefined, []);
    });
    testTest(test, "assigning to list indices", (vm) => {
        expectEval(vm, "let x = [1, 2, 3]; x.(1) = 42; x", [1, 42, 3], []);
        expectEval(
            vm,
            "let x = [1, 2, 3]; x.(1) = x.(2); x",
            [1, 3, 3],
            [],
        );
    });
    testTest(test, "getting length", (vm) => {
        expectEval(vm, "let x = [1, 2, 3]; #x", 3, []);
        expectEval(vm, "let x = [1: 2, 2: 3, 3: 4]; #x", 3, []);
        expectEval(vm, "let x = 'hello'; #x", 5, []);
    });
    testTest(test, "mixed list and map items are an error", (vm) => {
        expectEvalError(vm, "[1, 2, 3: 4]", "backolon.eval.mixed_list_and_map");
    });
});
describe("string interpolation", () => {
    testTest(test, "string into string", (vm) => {
        expectEval(vm, "let x = 'world'; \"hello \\(x)!\"", "hello world!", []);
    });
    testTest(test, "non-string into string", (vm) => {
        expectEval(vm, 'let x = 123 + 456; "hello \\(x)!"', "hello 579!", []);
    });
    testTest(
        test,
        "interpolated values print as values, not as written",
        (vm) => {
            expectEval(
                vm,
                'let x = 0x12323; "hello \\(x)!"',
                "hello 74531!",
                [],
            );
        },
    );
});
describe("homoiconicity", () => {
    describe("quoting", () => {
        testTest(test, "quote of block", (vm) => {
            expect(vm.evalStr("`(ok bye)")).toBeInstanceOf(Builtin);
        });
        testTest(test, "quote of thing that already evaluates to itself", (vm) => {
            expectEval(vm, "`1", 1, []);
        });
        testTest(test, "double quoting", (vm) => {
            expect(vm.evalStr("``(ok)")).toBeInstanceOf(Builtin);
        });
        testTest(test, "quoting name", (vm) => {
            expectEval(vm, "`name", "name", []);
        });
    });
    describe("templating", () => {
        testTest(test, "interpolation into blocks", (vm) => {
            const y = vm.evalStr("let x = print; let y = {$x 2}; y(); y");
            expect(y).toBeInstanceOf(Builtin);
            expect(vm.out).toEqual(["2"]);
        });
        testTest(test, "multi-level templating", (vm) => {
            expectEval(
                vm,
                "let x = 1; print {print $x {print $y 2}}",
                undefined,
                ["(print 1 {print $y 2})"],
            );
        });
        testTest(test, "too many quotes error", (vm) => {
            expectEvalError(vm, "{{{$$$$x}}}", "backolon.eval.quasiquote.too_many_unquotes");
        });
        testTest(test, "quotes at end error", (vm) => {
            expectEvalError(vm, "{$}", /stray quotes/);
        });
    });
    describe("eval", () => {
        testTest(test, "simple eval in original environment", (vm) => {
            expectEval(vm, "let x = `(print 1); x()", undefined, ["1"]);
        });
        testTest(test, "eval in constructed environment", (vm) => {
            expectEval(
                vm,
                "let x = `(say 1); x [say: fn(x) print x, x end]",
                undefined,
                ["1 1"],
            );
        });
        testTest(test.todo, "concatenation of blocks", (vm) => {
            expectEval(vm, "eval `(1 +) + `(2)", 3, []);
        });
    });
    testTest(test, "implicit keys", (vm) => {
        expectEval(vm, "let x = 1; let y = 2; [`x:, `y:]", { x: 1, y: 2 }, []);
    });
});
describe("recursion stress tests with memoization", () => {
    const MEMOIZE =
        "let memoize = fn(f) let cache = [:]; fn(x) x in cache ? cache.(x) : (cache.(x) = f(x)) end end";
    const MEMOIZE_F = (f: (a: number) => number) => {
        const cache: Record<string, number> = {};
        return (a: number) => (cache["" + a] ??= f(a));
    };
    testTest(test, "A000142 (factorial)", (vm) => {
        const x = 100;
        const factorial = (a: number): number =>
            a > 1 ? a * factorial(a - 1) : 1;
        expectEval(
            vm,
            `let factorial = fn(a) a > 1 ? a * factorial(a - 1) : 1 end; factorial ${x}`,
            factorial(x),
            [],
        );
    });
    testTest(test, "A000045 (Fibonacci sequence)", (vm) => {
        const x = 100;
        const fibonacci = MEMOIZE_F((a) =>
            a < 2 ? a : fibonacci(a - 1) + fibonacci(a - 2),
        );
        expectEval(
            vm,
            `${MEMOIZE}; let fibonacci = memoize fn(a) a < 2 ? a : fibonacci(a - 1) + fibonacci(a - 2) end; fibonacci ${x}`,
            fibonacci(x),
            [],
        );
    });
    testTest(test, "A005185 (Hofstadter 'Q' sequence)", (vm) => {
        const x = 80;
        const q = MEMOIZE_F((a) =>
            a < 3 ? 1 : q(a - q(a - 1)) + q(a - q(a - 2)),
        );
        expectEval(
            vm,
            `${MEMOIZE}; let q = memoize fn(a) a < 3 ? 1 : q(a - q(a - 1)) + q(a - q(a - 2)) end; q ${x}`,
            q(x),
            [],
        );
    });
    testTest(test, "A063510", (vm) => {
        const x = 65536;
        const A063510 = (a: number): number =>
            a < 2 ? 1 : 1 + A063510((a ** 0.5) | 0);
        expectEval(
            vm,
            "let f = fn(a) a < 2 ? 1 : f((a ** .5) | 0) + 1 end; f 65536",
            A063510(x),
            [],
        );
    });
    testTest(test, "list building via splat", (vm) => {
        const x = 8;
        expectEval(
            vm,
            `let f = fn(a, n) n > 0 ? f(a, n - 1) + f(a, n - 1) : [a] end; f 1 ${x}`,
            new Array(2 ** x).fill(1),
            [],
        );
    });
});
