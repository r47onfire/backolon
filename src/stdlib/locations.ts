import { LocationTrace } from "../errors";

function bloc(moduleName: string) {
    return new LocationTrace(0, 0, new URL(`backolon:${moduleName}`));
}

export const FFI_LOC = bloc("builtins");
export const BUILTINS_LOC = bloc("ffi");
