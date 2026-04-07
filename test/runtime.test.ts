import { describe, expect, test } from "bun:test";
import { BUILTINS_MODULE, Scheduler, ThingType } from "../src";
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
    test("declaration", () => {
        expectEval("let a", {
            t: ThingType.nil,
        });
    });
    test("declaration return value", () => {
        expectEval("let a = 1", {
            t: ThingType.number,
            v: 1
        });
    });
    test("initialization and retrieval", () => {
        expect(expectEval("let a = __declare; a b print; b 'test'; b", {
            t: ThingType.nativefunc,
            v: "print"
        })).toEqual(["test"]);
    });
    test("redeclaration throws", () => {
        expectEvalError("let a; let a", "variable \"a\" already exists in this scope");
    });
    test("new scopes are not created by inner blocks", () => {
        expectEvalError("(let a); (let a)", "variable \"a\" already exists in this scope");
    });
    test("can only declare a name", () => {
        expectEvalError("let 1 = 2", "cannot assign to number");
    });
    test("declarations override globals", () => {
        expectEvalError("let print = 1; print 'hi'", "can't call number");
    });
    test("declaration syntax requires literal '='", () => {
        expectEvalError("let a 1", "can't call nil");
    });
    test("reassignment", () => {
        expect(expectEval("let a = 1; print a; a = 2; print a = 3; a", {
            t: ThingType.number,
            v: 3
        })).toEqual(["1", "3"]);
    });
    test("assignment can span multiple lines", () => {
        expectEval("let a; a =\n3; a", {
            t: ThingType.number,
            v: 3
        });
    });
    test("assignment is right associative", () => {
        expectEval("let a; let b; a = b = 1", {
            t: ThingType.number,
            v: 1
        });
    });
    test("assignment requires the variable to exist", () => {
        expectEvalError("thisWasNotDeclared = 1", "undefined: \"thisWasNotDeclared\"", "note: add \"let\" to declare \"thisWasNotDeclared\" to be in this scope");
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
        expectEval("let foo = [] => 1; let bar = foo; bar", {
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
        expectEval("let callWithThree = [function] => function 3; let outerVariable; callWithThree [three] => outerVariable = three; outerVariable", {
            t: ThingType.number,
            v: 3
        });
    });
    test("lambda default parameters have dynamic scope", () => {
        expectEval("let x = 4; let f = [a=x] => a; ([] => (let x = 3; f!))!", {
            t: ThingType.number,
            v: 3
        });
    });
    test("lambdas are terminated by a newline like everything else", () => {
        expect(expectEval("let f = [x] => print x 'hi'\nf 1\nf 2", {
            t: ThingType.nil,
        })).toEqual(["1 hi", "2 hi"]);
    });
    test("lambdas with rest parameters", () => {
        expect(expectEval("let f = [x y z...] => print x y z; f 1 2; f 1 2 3 4 5", {
            t: ThingType.nil,
        })).toEqual(["1 2 []", "1 2 [3, 4, 5]"]);
        expectEvalError("[x... y...] => 1", "can only have 1 rest parameter");
        // expectEval("let f = [x] => (x x; x x); f f", { t: ThingType.nil });
        expectEval("let f = [x] => (if x > 0 (f x - 1) (g!)); let g = [] => f 10; g!", { t: ThingType.nil });
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
        expectEvalError("'hello' + 1", "No overload exists for operator \"add\" with arguments types \"string\", \"number\"");
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
        expectEval("let x = 1 + 2; x", {
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
        expectEvalError("[1, 2, 3: 4]", "No overload exists for operator \"add\" with arguments types \"list\", \"map\"");
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
    test("collections with dynamic values", () => {
        expectEval("let x = 1; [x, x + 1, x + 2]->x", {
            t: ThingType.number,
            v: 2,
        });
    });
});
describe("string interpolation", () => {
    test("string into string", () => {
        expectEval("let x = 'world'; \"hello {x}!\"", {
            t: ThingType.string,
            v: "hello world!",
        });
    });
    test("non-string into string", () => {
        expectEval("let x = 123+456; \"hello {x}!\"", {
            t: ThingType.string,
            v: "hello 579!",
        });
    });
    test("literals as-written are unparsed directly", () => {
        expectEval("let x = 0x12323; \"hello {x}!\"", {
            t: ThingType.string,
            v: "hello 0x12323!",
        });
    });
    test("single string block convert to string", () => {
        expectEval("let x = 1; \"{x}\"", {
            t: ThingType.string,
            v: "1",
        });
    })
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
            expect(expectEval("let x = print; let y = {$x 2}; __eval y; y", {
                t: ThingType.roundblock,
                c: [
                    { t: ThingType.nativefunc, v: "print" },
                    { t: ThingType.space },
                    { t: ThingType.number, v: 2 },
                ]
            })).toEqual(["2"]);
        });
        test("multi-level templating", () => {
            expect(expectEval("let x = 1; print {print $x {print $y 2}}", {
                t: ThingType.nil,
            })).toEqual(["(print 1 {print $y 2})"]);
        });
        test("too many quotes error", () => {
            expectEvalError("{{{$$$$x}}}", "too many unquotes (there are 4 unquotes, but we're only at level 3)", "note: level 3 starts here:");
        })
    });
    describe("eval", () => {
        test("simple eval in original environment", () => {
            expect(expectEval("let x = `(print 1); __eval x", {
                t: ThingType.nil,
            })).toEqual(["1"]);
        });
        test("eval in constructed environment", () => {
            expect(expectEval("let x = `(say 1); __eval x [`say: [x] => print x x]", {
                t: ThingType.nil,
            })).toEqual(["1 1"]);
        });
        test("concatenation of blocks", () => {
            expectEval("__eval `(1 +) + `(2)", {
                t: ThingType.number,
                v: 3,
            });
        });
    });
    test("implicit keys", () => {
        // TODO: this is a map again, if hash changes the order may be wrong
        expectEval("let x = 1; let y = 2; [`x:, `y:]", {
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
        })
    });
});
