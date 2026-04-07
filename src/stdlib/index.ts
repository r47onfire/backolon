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

export const BUILTINS_MODULE = createBuiltins();
export const FFI_MODULE = createFFIModule();
