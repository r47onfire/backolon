import { BUILTINS_MODULE, Scheduler, ThingType } from "@r47onfire/backolon";
import { describe, expect, test } from "bun:test";
import { expectEval, expectEvalError, F } from "./astCheck";

test("empty result", () => {
    expectEval("", {
        t: ThingType.nil,
    });
});
test("roundtrip", () => {
    const s = new Scheduler([BUILTINS_MODULE]);
    s.startTask(1, "a + 1", null, F);
    const s2 = new Scheduler([BUILTINS_MODULE]);
    s2.loadFromSerialized(s.serializeTasks());
    expect(s2).toEqual(s);
});
test("trivial return value", () => {
    expectEval("123\n", {
        t: ThingType.number,
        v: 123
    });
});
test("double semicolon suppresses return value", () => {
    expectEval("'fail';;", {
        t: ThingType.nil,
    });
});
describe("calling functions", () => {
    test("'print' prints and returns nil", () => {
        expect(expectEval("print 1; print (print 2)", {
            t: ThingType.nil,
        })).toEqual(["1", "2", "nil"]);
    });
    test("sequencing works with newline also instead of semicolons", () => {
        expect(expectEval("print 1\nprint 2\n", {
            t: ThingType.nil,
        })).toEqual(["1", "2"]);
    });
    test("call 'print' with 0 arguments prints newline", () => {
        expect(expectEval("print!", {
            t: ThingType.nil,
        })).toEqual([""]);
    });
    test("'print' with varargs", () => {
        expect(expectEval("print 1; print 2 3; print 4 5 6", {
            t: ThingType.nil,
        })).toEqual(["1", "2 3", "4 5 6"]);
    });
});
describe("variables", () => {
    test("declaration return value", () => {
        expectEval("a := 1", {
            t: ThingType.number,
            v: 1
        });
    });
    test("initialization and retrieval", () => {
        expect(expectEval("a := __declare; a b print; b 'test'; b", {
            t: ThingType.nativefunc,
            v: "print"
        })).toEqual(["test"]);
    });
    test("redeclaration throws", () => {
        expectEvalError("a := nil; a := nil", "variable \"a\" already exists in this scope");
    });
    test("new scopes are not created by inner blocks", () => {
        expectEvalError("(a := nil); (a := nil)", "variable \"a\" already exists in this scope");
    });
    test("can only declare a name", () => {
        expectEvalError("1 := 2", "cannot assign to number");
    });
    test("declarations override globals", () => {
        expectEvalError("print := 1; print 'hi'", "can't call number");
    });
    test("reassignment", () => {
        expect(expectEval("a := 1; print a; a = 2; print a = 3; a", {
            t: ThingType.number,
            v: 3
        })).toEqual(["1", "3"]);
    });
    test("assignment can span multiple lines", () => {
        expectEval("a := nil; a =\n3; a", {
            t: ThingType.number,
            v: 3
        });
    });
    test("assignment is right associative", () => {
        expectEval("a := nil; b := nil; a = b = 1", {
            t: ThingType.number,
            v: 1
        });
    });
    test("assignment requires the variable to exist", () => {
        expectEvalError("thisWasNotDeclared = 1", "undefined: \"thisWasNotDeclared\"", "note: change the \"=\" to \":=\" to declare \"thisWasNotDeclared\" to be in this scope");
    });
});
describe("lambdas", () => {
    test("create lambdas", () => {
        expectEval("[] => 1", {
            t: ThingType.func,
            v: null,
        });
    });
    test("lambdas get the name of the first thing they're assigned to", () => {
        expectEval("foo := [] => 1; bar := foo; bar", {
            t: ThingType.func,
            v: "foo",
        });
    });
    test("'return' exists and is a continuation", () => {
        expectEval("([] => return)!", {
            t: ThingType.continuation,
        });
    });
    test("'return' correctly stops execution and returns the value", () => {
        expect(expectEval("([] => (return 3; print 1))!", {
            t: ThingType.number,
            v: 3
        })).toEqual([]);
    });
    test("closed-over scopes can be accessed and mutated", () => {
        expectEval("callWithThree := [function] => function 3; outerVariable := nil; callWithThree [three] => outerVariable = three; outerVariable", {
            t: ThingType.number,
            v: 3
        });
    });
    test("lambda default parameters have dynamic scope", () => {
        expectEval("x := 4; f := [a=x] => a; ([] => (x := 3; f!))!", {
            t: ThingType.number,
            v: 3
        });
    });
    test("lambdas are terminated by a newline like everything else", () => {
        expect(expectEval("f := [x] => print x 'hi'\nf 1\nf 2", {
            t: ThingType.nil,
        })).toEqual(["1 hi", "2 hi"]);
    });
    test("lambdas with rest parameters", () => {
        expect(expectEval("f := [x y z...] => print x y z; f 1 2; f 1 2 3 4 5", {
            t: ThingType.nil,
        })).toEqual(["1 2 []", "1 2 [3, 4, 5]"]);
        expectEvalError("[x... y...] => 1", "can only have 1 rest parameter");
    });
    test("recurson is capped", () => {
        expectEvalError("f := [x] => (x x; x x); f f", "too much recursion");
        expectEvalError("f := [x] => (if x > 0 (f x - 1) (g!)); g := [] => f 10; g!", "too much recursion");
    });
});
describe("conditionals", () => {
    test("if true", () => {
        expectEval("if true 'foo' 'bar'", {
            t: ThingType.string,
            v: "foo"
        });
        expectEval("if false 'foo' 'bar'", {
            t: ThingType.string,
            v: "bar"
        });
    });
    test("if side effects", () => {
        expect(expectEval("if true (print 1) (print 2)", {
            t: ThingType.nil,
        })).toEqual(["1"]);
        expect(expectEval("if false (print 1) (print 2)", {
            t: ThingType.nil,
        })).toEqual(["2"]);
    });
});
describe("operators", () => {
    test("add", () => {
        expectEval("1 + 2", {
            t: ThingType.number,
            v: 3
        });
        expectEval("1000000000000000000000 + 1", {
            t: ThingType.number,
            v: 1000000000000000000001n
        });
        expectEval("100000000000000000000000000 + 100000000000000000000000000", {
            t: ThingType.number,
            v: 200000000000000000000000000n
        });
        expectEval("'hello' + 'world'", {
            t: ThingType.string,
            v: "helloworld",
        });
        expectEval("'hello' + ', ' + 'world' + '!'", {
            t: ThingType.string,
            v: "hello, world!",
        });
        expectEvalError("'hello' + 1", "No overload exists for operator \"add\" with argument types \"string\", \"number\"");
        expectEvalError("8**88**88", /out of memory|size exceeded/i);
    });
    test("sub", () => {
        expectEval("1 - 2", {
            t: ThingType.number,
            v: -1
        });
        expectEval("-0.8-8", {
            t: ThingType.number,
            v: -8.8
        });
    });
    test("works with assignment", () => {
        expectEval("x := 1 + 2; x", {
            t: ThingType.number,
            v: 3
        });
    });
});
describe("collections", () => {
    test("empty collections", () => {
        expectEval("[]", {
            t: ThingType.list,
            c: []
        });
        expectEval("[:]", {
            t: ThingType.map,
            c: []
        });
    });
    test("one element collections", () => {
        expectEval("[1]", {
            t: ThingType.list,
            c: [{
                t: ThingType.number,
                v: 1
            }]
        });
        expectEval("[1:2]", {
            t: ThingType.map,
            c: [{
                t: ThingType.pair,
                c: [
                    {
                        t: ThingType.number,
                        v: 1,
                    },
                    {
                        t: ThingType.number,
                        v: 2
                    }
                ]
            }]
        });
    });
    test("self-referential collections", () => {
        expect(expectEval("x := [0]; x->0 = x; print x", {
            t: ThingType.nil
        })).toEqual(["#0=[#0#]"]);
    });
    test("multiple element collections", () => {
        expectEval("[1, 2]", {
            t: ThingType.list,
            c: [
                {
                    t: ThingType.number,
                    v: 1,
                },
                {
                    t: ThingType.number,
                    v: 2,
                }
            ]
        });
        // TODO: this fails when the hash algo changes, because maps are unpredictable order
        expectEval("[1: 2, 3: 4]", {
            t: ThingType.map,
            c: [
                {
                    t: ThingType.pair,
                    c: [
                        {
                            t: ThingType.number,
                            v: 3,
                        },
                        {
                            t: ThingType.number,
                            v: 4,
                        }
                    ]
                },
                {
                    t: ThingType.pair,
                    c: [
                        {
                            t: ThingType.number,
                            v: 1,
                        },
                        {
                            t: ThingType.number,
                            v: 2,
                        }
                    ]
                }
            ]
        });
        expectEvalError("[1, 2, 3: 4]", "No overload exists for operator \"add\" with argument types \"list\", \"map\"");
    });
    test("indexing lists", () => {
        expectEval("[1, 2, 3]->2", {
            t: ThingType.number,
            v: 3,
        });
        expectEval("[[1, 2], [3, 4]]->1->1", {
            t: ThingType.number,
            v: 4,
        });
    });
    test("indexing maps", () => {
        expectEval("[1: 2, 3: 4]->3", {
            t: ThingType.number,
            v: 4,
        });
        expectEvalError("[1: 2, 3: 4]->4", "key 4 not found in map");
    });
    test("assigning to list indices", () => {
        expectEval("x := [1, 2, 3]; x->1 = 42; x", {
            t: ThingType.list,
            c: [
                {
                    t: ThingType.number,
                    v: 1,
                },
                {
                    t: ThingType.number,
                    v: 42,
                },
                {
                    t: ThingType.number,
                    v: 3,
                }
            ]
        });
        expectEval("x := [1, 2, 3]; x->1 = x->2; x", {
            t: ThingType.list,
            c: [
                {
                    t: ThingType.number,
                    v: 1,
                },
                {
                    t: ThingType.number,
                    v: 3,
                },
                {
                    t: ThingType.number,
                    v: 3,
                }
            ]
        });
    });
    test("collections with dynamic values", () => {
        expectEval("x := 1; [x, x + 1, x + 2]->x", {
            t: ThingType.number,
            v: 2,
        });
    });
    test("getting length", () => {
        expectEval("x := [1, 2, 3]; #x", {
            t: ThingType.number,
            v: 3
        });
        expectEval("x := [1: 2, 2: 3, 3: 4]; #x", {
            t: ThingType.number,
            v: 3
        });
        expectEval("x := 'hello'; #x", {
            t: ThingType.number,
            v: 5
        });
    });
});
describe("string interpolation", () => {
    test("string into string", () => {
        expectEval("x := 'world'; \"hello {x}!\"", {
            t: ThingType.string,
            v: "hello world!",
        });
    });
    test("non-string into string", () => {
        expectEval("x := 123+456; \"hello {x}!\"", {
            t: ThingType.string,
            v: "hello 579!",
        });
    });
    test("literals as-written are unparsed directly", () => {
        expectEval("x := 0x12323; \"hello {x}!\"", {
            t: ThingType.string,
            v: "hello 0x12323!",
        });
    });
    test("single string block convert to string", () => {
        expectEval("x := 1; \"{x}\"", {
            t: ThingType.string,
            v: "1",
        });
    });
});
describe("homoiconicity", () => {
    describe("quoting", () => {
        test("quote of block", () => {
            expectEval("`(ok bye)", {
                t: ThingType.roundblock,
            });
        });
        test("quote of thing that already evaluates to itself", () => {
            expectEval("`1", {
                t: ThingType.number,
            });
        });
        test("double quoting", () => {
            expectEval("``(ok)", {
                t: ThingType.apply,
                c: [
                    {
                        t: ThingType.nativefunc,
                        v: "__quote",
                    },
                    {
                        t: ThingType.roundblock
                    }
                ]
            });
        });
        test("quoting name", () => {
            expectEval("`name", {
                t: ThingType.name,
                v: "name"
            });
        });
    });
    describe("templating", () => {
        test("interpolation into blocks", () => {
            expect(expectEval("x := print; y := {$x 2}; __eval y; y", {
                t: ThingType.roundblock,
                c: [
                    { t: ThingType.nativefunc, v: "print" },
                    { t: ThingType.space },
                    { t: ThingType.number, v: 2 },
                ]
            })).toEqual(["2"]);
        });
        test("multi-level templating", () => {
            expect(expectEval("x := 1; print {print $x {print $y 2}}", {
                t: ThingType.nil,
            })).toEqual(["(print 1 {print $y 2})"]);
        });
        test("too many quotes error", () => {
            expectEvalError("{{{$$$$x}}}", "too many unquotes (there are 4 unquotes, but we're only at level 3)", "note: level 3 starts here:");
        });
        test("quotes at end error", () => {
            expectEvalError("{$}", "stray quotes at end");
        });
    });
    describe("eval", () => {
        test("simple eval in original environment", () => {
            expect(expectEval("x := `(print 1); eval x", {
                t: ThingType.nil,
            })).toEqual(["1"]);
        });
        test("eval in constructed environment", () => {
            expect(expectEval("x := `(say 1); evalin [`say: [x] => print x x] x", {
                t: ThingType.nil,
            })).toEqual(["1 1"]);
        });
        test("concatenation of blocks", () => {
            expectEval("eval `(1 +) + `(2)", {
                t: ThingType.number,
                v: 3,
            });
        });
    });
    test("implicit keys", () => {
        // TODO: this is a map again, if hash changes the order may be wrong
        expectEval("x := 1; y := 2; [`x:, `y:]", {
            t: ThingType.map,
            c: [
                {
                    t: ThingType.pair,
                    c: [
                        {
                            t: ThingType.name,
                            v: "x",
                        },
                        {
                            t: ThingType.number,
                            v: 1,
                        }
                    ]
                },
                {
                    t: ThingType.pair,
                    c: [
                        {
                            t: ThingType.name,
                            v: "y",
                        },
                        {
                            t: ThingType.number,
                            v: 2,
                        }
                    ]
                }
            ]
        });
    });
});
describe("recursion stress tests with memoization", () => {
    const MEMOIZE = "memoize := [f] => (cache := [:]; [x] => (if x <: cache cache->x (cache->x = (f x))))";
    test("A000142 (factorial)", async () => {
        expectEval(`${MEMOIZE}; f := (memoize [a] => if a > 1 (a * (f a - 1)) 1); f 50`, {
            t: ThingType.number,
            v: 30414093201713378043612608166064768844377641568960512000000000000n
        });
    });
    test("A000045 (Fibonacci sequence)", async () => {
        expectEval(`${MEMOIZE}; f := (memoize [a] => if a <= 1 a ((f a - 1) + (f a - 2))); f 50`, {
            t: ThingType.number,
            v: 12586269025
        });
    });
    test("A005185 (Hofstadter 'Q' sequence)", async () => {
        expectEval(`${MEMOIZE}; f := (memoize [a] => if a < 3 1 ((f a - (f a - 1)) + (f a - (f a - 2)))); f 50`, {
            t: ThingType.number,
            v: 25
        });
    });
    test("A063510", async () => {
        expectEval(`${MEMOIZE}; f := (memoize [a] => if a > 1 ((f a ** .5 | 0) + 1) 1); f 50`, {
            t: ThingType.number,
            v: 4
        });
    });
});
