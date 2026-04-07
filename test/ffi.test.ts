import { expect, test } from "bun:test";
import { ThingType } from "../src";
import { JSObjectType } from "../src/objects/js_interop";
import { expectEval } from "./astCheck";

test("FFI basic functionality", () => {
    // Test accessing globalThis
    expectEval("JS_GLOBAL", {
        t: JSObjectType,
    });

    // Test property access with arrow
    expectEval("JS_GLOBAL->'Math'", {
        t: JSObjectType,
        v: { value: Math }
    });

    // Test nested property access
    expectEval("JS_GLOBAL->'Math'->'PI'", {
        t: ThingType.number,
        v: Math.PI,
    });

    // Test function call
    expectEval("JS_GLOBAL->'Math'->'abs' (-5)", {
        t: ThingType.number,
        v: 5
    });

    // Test constructor
    expectEval("JS_new (JS_GLOBAL->'Date') '2023-01-01'", {
        t: JSObjectType,
        v: { value: new Date("2023-01-01") }
    });
});

test("FFI dot syntax", () => {
    // Test dot syntax for property access
    expectEval("JS_GLOBAL.Math", {
        t: JSObjectType,
    });

    expectEval("JS_GLOBAL.Math.PI", {
        t: ThingType.number,
        v: Math.PI
    });

    expectEval("JS_GLOBAL.Math.abs (-5)", {
        t: ThingType.number,
        v: 5
    });
});

test("FFI functions are bound by default", () => {
    expect(expectEval("let f = (JS_new (JS_GLOBAL.Function) 'a' 'class Foo {constructor(x) { this.x = x; } hi() { return this.x * 123; } }; return new Foo(a); '); let y = (f 2).hi; print (y!)", {
        t: ThingType.nil,
    })).toEqual(["246"]);
});
