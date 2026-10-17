import { AccessType, ErrnoCode, JEBError, JebVM, Location, pushCommand, pushData, VariableReference } from "@r47onfire/jeb";
import { Span } from "../parser/span";
import { Importer, OP_do_import, SourceTracker } from "./importer";
import { Module } from "./module";

/**
 * The part of {@link BackolonVM} state captured by JEB's state
 * snapshot/rollback mechanism. Module loading state is represented as
 * each cached module's `parent` link (see {@link Module.parent});
 * restoring it makes half-loaded modules look unloaded again.
 */
interface BackolonVMState {
    moduleLoad: (Module | null)[];
    parser: Parser | null;
    resetParser: boolean;
}

/** Everything the VM tracks about one registered module. */
interface ModuleCacheEntry {
    mod: Module,
    /** The module's source, once a loader has provided it. */
    src: SourceTracker | undefined,
    /** Source spans registered for this module; a span's index in this array is part of its {@link Location}. */
    map: Span[],
}

/**
 * The JEB VM specialized for Backolon: on top of the base VM it keeps
 * the module cache, the current parser (if any), and the span tables
 * that map JEB {@link Location}s back to source ranges.
 */
export class BackolonVM extends JebVM<BackolonVM> {
    /** Current parser context - null if not parsing */
    parser: Parser | null = null;
    constructor(public importer: Importer) {
        super();
        this.#createBuiltinsModule();
        create_parser_module(this);
    }
    /** Captures the module `parent` links (and parser) for rollback. */
    override getState(): BackolonVMState {
        return {
            moduleLoad: (this.modcache ?? []).map(mod => mod.mod.parent),
            parser: this.parser,
            resetParser: true,
        }
    }
    /** Restores a state captured by {@link getState}; the parser is always reset to the captured one. */
    override restoreState(state: BackolonVMState) {
        state.moduleLoad.forEach((parent, i) => this.modcache[i]!.mod.parent = parent);
        if (state.resetParser) this.parser = state.parser;
    }
    /**
     * All modules this VM knows about, in registration order. An entry's
     * index here is the second component of every {@link Location}
     * pointing into that module.
     */
    modcache: ModuleCacheEntry[] = [];
    /**
     * Starts running the main module
     * @param url URL of the main module
     */
    override start(url: URL) {
        pushCommand(this, OP_do_import, null, true);
        pushData(this, url);
    }
    /** Looks up a module's cache entry by exact URL; returns its index and the entry (or undefined). */
    #modcacheGet(url: URL): [number, ModuleCacheEntry | undefined] {
        const i = this.modcache.findIndex(m => m.mod.id.href === url.href);
        return [i, this.modcache[i]];
    }
    /** The registered module for `url`, or undefined if it was never created. */
    getModule(url: URL) {
        return this.#modcacheGet(url)[1]?.mod;
    }
    /**
     * Creates a module for `url` — with a fresh global environment nested
     * inside the builtins environment — and registers it in the cache.
     * Throws if a module for `url` already exists.
     */
    createModule(url: URL, parent: Module | null): Module {
        const exist = this.#modcacheGet(url)[1];
        if (exist) {
            throw new JEBError(ErrnoCode.EEXIST, `module ${url.href} already exists`);
        }
        const mod = new Module(this.createEnv(this.builtinsEnv), url, parent);
        this.modcache.push({
            mod,
            src: undefined,
            map: []
        });
        return mod;
    }
    /**
     * Records the source text of an already-registered module and returns
     * its tracker. If the module isn't registered, warns and returns
     * undefined instead.
     */
    setSource(url: URL, src: string): SourceTracker | undefined {
        const i = this.#modcacheGet(url)[1];
        if (!i) {
            console.warn(`attempted to set source for module ${url} that has not yet been registered`);
            return;
        }
        return i.src = new SourceTracker(url, src, {});
    }
    /** The recorded source text of the module at `url`, if any. */
    getSource(url: URL): string | undefined {
        return this.#modcacheGet(url)[1]?.src?.code;
    }
    /**
     * Registers a source span with its module and returns the opaque
     * {@link Location} (span index, module index) that represents it
     * elsewhere in the VM. Throws if the span's module isn't registered.
     */
    registerSpan(span: Span): Location {
        const url = span.file;
        const { 0: index, 1: mc } = this.#modcacheGet(url);
        if (!mc) throw new JEBError(ErrnoCode.ENOENT);
        return location([mc.map.push(span) - 1, index]);
    }
    /** Resolves a {@link Location} back to the span it was registered from. */
    getSpan(location: Location): Span {
        const span = this.modcache[location[1]!]?.map[location[0]!];
        if (!span) throw new JEBError(ErrnoCode.ENOENT);
        return span;
    }
    /**
     * Adds a syntax-highlight tag to every character position covered by
     * the span at `location`, in that module's {@link SourceTracker}.
     * Unknown locations and source-less modules are ignored (with a
     * warning), since highlighting is best-effort.
     */
    tag(location: Location, tag: string) {
        const { 0: spanIndex, 1: fileIndex } = location;
        const modentry = this.modcache[fileIndex!];
        const mySpan = modentry?.map[spanIndex!];
        if (!mySpan) {
            console.warn(`tried to tag span at location ${location} which doesn't exist`);
            return;
        }
        const st = modentry?.src;
        if (!st) {
            console.warn(`ignoring tag on module ${modentry.mod.id} which has no source`);
            return;
        }
        const { start, end } = mySpan;
        for (var i = start; i < end; i++) (st.tags[i] ??= []).push(tag);
    }
    /**
     * Registers the special `backolon:builtins` module, whose exports
     * mirror every binding of the builtins environment, so builtin names
     * can be imported like any other module's exports.
     */
    #createBuiltinsModule() {
        const env = this.builtinsEnv;
        this.createModule(new URL("backolon:builtins"), null).exports = Object.fromEntries(Object.keys(env.bindings).map(k => [k, new VariableReference(AccessType.PROPERTY, env, k)]));
    }
}

/** Brand symbol stamped on arrays that are {@link Location}s, so they can be told apart from plain number pairs. */
export const LOCATION_TAG = Symbol("__location__");

/** Stamps `x` with {@link LOCATION_TAG} and returns it as a {@link Location}. */
const location = (x: Location): Location => {
    (x as any)[LOCATION_TAG] = LOCATION_TAG;
    return x;
}
