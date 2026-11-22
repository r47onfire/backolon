import { Module } from "./module";
import type { BackolonVM, TaskGen } from "../vm";

/**
 * Interface for what a Javascript module needs to comply with to be able to be
 * imported.
 */
export interface JSModule {
    setup(
        module: Module,
        query: URLSearchParams,
        vm: BackolonVM,
    ): TaskGen<void>;
}
