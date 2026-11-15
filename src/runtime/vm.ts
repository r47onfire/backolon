import { Importer, OP_do_import, SourceTracker } from "./importer";
import { Module } from "./module";

/**
 * The part of {@link BackolonVM} state captured by JEB's state snapshot/rollback
 * mechanism. Module loading state is represented as each cached module's
 * `parent` link (see {@link Module.parent}); restoring it makes half-loaded
 * modules look unloaded again.
 */
export interface BackolonVMState {
    moduleLoad: (Module | null)[];
    parser: Parser | null;
    resetParser: boolean;
}

/** Everything the VM tracks about one registered module. */
export interface ModuleCacheEntry {
    mod: Module;
    /** The module's source, once a loader has provided it. */
    src: SourceTracker | undefined;
    /**
     * Source spans registered for this module; a span's index in this array is
     * part of its {@link Location}.
     */
    map: Span[];
}

/**
 * The JEB VM specialized for Backolon: on top of the base VM it keeps the
 * module cache, the current parser (if any), and the span tables that map JEB
 * {@link Location}s back to source ranges.
 */
export class BackolonVM {
    /** Current parser context - null if not parsing */
    parser: Parser | null = null;
    constructor(public importer: Importer) {
        this.#createBuiltinsModule();
        create_parser_module(this);
    }
    /**
     * All modules this VM knows about, in registration order. An entry's index
     * here is the second component of every {@link Location} pointing into that
     * module.
     */
    modcache: ModuleCacheEntry[] = [];
    /**
     * Looks up a module's cache entry by exact URL; returns its index and the
     * entry (or undefined).
     */
    #modcacheGet(url: URL): [number, ModuleCacheEntry | undefined] {
        const i = this.modcache.findIndex((m) => m.mod.id.href === url.href);
        return [i, this.modcache[i]];
    }
    /** The registered module for `url`, or undefined if it was never created. */
    getModule(url: URL) {
        return this.#modcacheGet(url)[1]?.mod;
    }
    /**
     * Creates a module for `url` -- with a fresh global environment nested
     * inside the builtins environment -- and registers it in the cache. Throws
     * if a module for `url` already exists.
     */
    createModule(url: URL, parent: Module | null): Module {
        const exist = this.#modcacheGet(url)[1];
        if (exist) {
            throw new JEBError(
                ErrnoCode.EEXIST,
                `module ${url.href} already exists`,
            );
        }
        const mod = new Module(this.createEnv(this.builtinsEnv), url, parent);
        this.modcache.push({
            mod,
            src: undefined,
            map: [],
        });
        return mod;
    }
    /**
     * Registers the special `backolon:builtins` module, whose exports mirror
     * every binding of the builtins environment, so builtin names can be
     * imported like any other module's exports.
     */
    #createBuiltinsModule() {
        const env = this.builtinsEnv;
        this.createModule(new URL("backolon:builtins"), null).exports =
            Object.fromEntries(
                Object.keys(env.bindings).map((k) => [
                    k,
                    new VariableReference(AccessType.PROPERTY, env, k),
                ]),
            );
    }
}

/**
 * Brand symbol stamped on arrays that are {@link Location}s, so they can be told
 * apart from plain number pairs.
 */
export const LOCATION_TAG = Symbol("__location__");

/** Stamps `x` with {@link LOCATION_TAG} and returns it as a {@link Location}. */
const location = (x: Location): Location => {
    (x as any)[LOCATION_TAG] = LOCATION_TAG;
    return x;
};
