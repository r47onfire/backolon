import { parse } from "../parser/parse";
import { Scheduler } from "../runtime/scheduler";
import { initCoreSyntax } from "./core";
import { initFFI } from "./ffi";
import { BUILTINS_LOC, FFI_LOC } from "./locations";
import { NativeModule } from "./module";

function createBuiltins(): NativeModule {
    const mod = new NativeModule("backolon_core", BUILTINS_LOC);
    initCoreSyntax(mod);
    return mod;
}

function createFFIModule(): NativeModule {
    const mod = new NativeModule("backolon_ffi", FFI_LOC);
    initFFI(mod);
    return mod;
}

/**
 * Built-in core language module.
 */
export const BUILTINS_MODULE = createBuiltins();
/**
 * JavaScript foreign-function interface module.
 */
export const FFI_MODULE = createFFIModule();

// @ts-expect-error
import ast from "./core.bk";

var CORE = ast;

declare global { const TEST: boolean }
if (typeof TEST === "undefined" ? typeof ast !== "object" : TEST) {
    // we're in a test
    CORE = parse(await Bun.file(import.meta.resolve("./core.bk")).text(), new URL("file://builtins/core.bk"));
}

const scheduler = new Scheduler([BUILTINS_MODULE]);
scheduler.startTaskRaw(0, CORE, BUILTINS_MODULE.env);
scheduler.stepUntilSuspended();
