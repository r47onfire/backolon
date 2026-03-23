import { afterEach, describe, expect, jest, spyOn, test } from "bun:test";
import { BUILTIN_ENV, BUILTIN_FUNCTIONS, Scheduler, ThingType } from "../src";
import { expectEval, expectEvalError, F } from "./astCheck";

afterEach(() => {
    jest.clearAllMocks();
});
test("empty result", () => {
    expectEval("", {
        t: ThingType.nil,
    });
});
test("roundtrip", () => {
    const s = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
    s.startTask(1, "a + 1", null, F);
    const s2 = new Scheduler(BUILTIN_FUNCTIONS, BUILTIN_ENV);
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
        const stdout = spyOn(console, "log");
        expectEval("print 1; print (print 2)", {
            t: ThingType.nil,
        });
        expect(stdout).toHaveBeenCalledTimes(3);
        expect(stdout).toHaveBeenNthCalledWith(1, "1");
        expect(stdout).toHaveBeenNthCalledWith(2, "2");
        expect(stdout).toHaveBeenNthCalledWith(3, "nil");
    });
    test("sequencing works with newline also instead of semicolons", () => {
        const stdout = spyOn(console, "log");
        expectEval("print 1\nprint 2\n", {
            t: ThingType.nil,
        });
        expect(stdout).toHaveBeenCalledTimes(2);
        expect(stdout).toHaveBeenNthCalledWith(1, "1");
        expect(stdout).toHaveBeenNthCalledWith(2, "2");
    });
    test("call 'print' with 0 arguments prints newline", () => {
        const stdout = spyOn(console, "log");
        expectEval("print!", {
            t: ThingType.nil,
        });
        expect(stdout).toHaveBeenCalledTimes(1);
        expect(stdout).toHaveBeenNthCalledWith(1, "");
    });
    test("'print' with varargs", () => {
        const stdout = spyOn(console, "log");
        expectEval("print 1; print 2 3; print 4 5 6", {
            t: ThingType.nil,
        });
        expect(stdout).toHaveBeenCalledTimes(3);
        expect(stdout).toHaveBeenNthCalledWith(1, "1");
        expect(stdout).toHaveBeenNthCalledWith(2, "2 3");
        expect(stdout).toHaveBeenNthCalledWith(3, "4 5 6");
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
        const stdout = spyOn(console, "log");
        expectEval("let a = __declare; a b print; b 'test'; b", {
            t: ThingType.nativefunc,
            v: "print"
        });
        expect(stdout).toHaveBeenCalledTimes(1);
        expect(stdout).toHaveBeenNthCalledWith(1, "test");
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
        const stdout = spyOn(console, "log");
        expectEval("let a = 1; print a; a = 2; print a = 3; a", {
            t: ThingType.number,
            v: 3
        });
        expect(stdout).toHaveBeenCalledTimes(2);
        expect(stdout).toHaveBeenNthCalledWith(1, "1");
        expect(stdout).toHaveBeenNthCalledWith(2, "3");
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
        const stdout = spyOn(console, "log");
        expectEval("let f = [x] => print x\nf 1\nf 2", {
            t: ThingType.nil,
        });
        expect(stdout).toHaveBeenCalledTimes(2);
    });
});
