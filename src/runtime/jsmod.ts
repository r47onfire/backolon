import { Module } from "./module";
import { BackolonVM } from "./vm";

/**
 * Interface for what a Javascript module needs to comply with to be able to be
 * imported.
 */
export interface JSModule {
    setup(
        module: Module,
        query: URLSearchParams,
        vm: BackolonVM,
    ): Promise<void>;
}

/** Interface for a JSON module object */
export interface JSONModule {
    code: any[];
    files: string[];
    sourceMap?: string;
}

/**
 * Not a sourcemap-V3 since the mappings don't have any concept of "compiled
 * line/pos".
 */
export interface JSONSourceMap {
    contents: string[];
    mappings: [start: number, end: number][][];
}
