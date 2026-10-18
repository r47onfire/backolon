import { Env, VariableReference } from "@r47onfire/jeb";

/**
 * A Backolon module: one loaded (or still loading) source file, with its
 * own global environment, its identity URL, and its named exports.
 * Modules are created and cached by {@link BackolonVM.createModule}.
 */
export class Module {
    // TODO: add parser modifications
    /** The named exports for the module */
    exports: Record<string, VariableReference> = {};
    /**
     * This is used to detect and throw a "circular import!" error when
     * attempting to do something (access properties, etc) of a module
     * when it's not finished loading, as well as to avoid loading it when
     * it's already loaded
     */
    parent: Module | null;
    constructor(public global: Env, public id: URL, parent: Module | null) {
        this.parent = parent;
        global.addConst(MODULE_SELF, this);
        global.addConst(MODULE_NAME, id);
    }
    /** The module's result value, once it has finished evaluating. */
    result: any;
}

/**
 * Special symbol identifier used to identify module names that can't be shadowed.
 */
export const MODULE_NAME = Symbol("__name__");

/**
 * Special symbol identifier used to link a module's environment back to the module
 * object itself
 */
export const MODULE_SELF = Symbol("__self__");

