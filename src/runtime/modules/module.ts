import { Env } from "../env";

/**
 * A Backolon module: one loaded (or still loading) source file, with its own
 * global environment, its identity URL, and its named exports. Modules are
 * created and cached by {@link BackolonVM.createModule}.
 */
export class Module extends Env {
    // TODO: add parser modifications
    /**
     * This is used to detect and throw a "circular import!" error when
     * attempting to do something (access properties, etc) of a module when it's
     * not finished loading, as well as to avoid loading it when it's already
     * loaded
     */
    parent: Module | null;
    constructor(
        builtins: Env[],
        public id: URL,
        parent: Module | null,
    ) {
        super(builtins);
        this.parent = parent;
        this.addUnshadowableFast("__module__", this);
        this.addUnshadowableFast("__name__", id);
    }
}
