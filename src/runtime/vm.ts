import { AccessType, ErrnoCode, JEBError, JebVM, Location, pushCommand, pushData, VariableReference } from "@r47onfire/jeb";
import { create_parser_module, Parser } from "../parser";
import { Span } from "../parser/span";
import { Importer, OP_do_import, SourceTracker } from "./importer";
import { Module } from "./module";

interface BackolonVMState {
    moduleLoad: (Module | null)[];
    parser: Parser | null;
    resetParser: boolean;
}

interface ModuleCacheEntry {
    mod: Module,
    src: SourceTracker | undefined,
    map: Span[],
}

export class BackolonVM extends JebVM<BackolonVM> {
    /** Current parser context - null if not parsing */
    parser: Parser | null = null;
    constructor(public importer: Importer) {
        super();
        this.#createBuiltinsModule();
        create_parser_module(this);
    }
    override getState(): BackolonVMState {
        return {
            moduleLoad: (this.modcache ?? []).map(mod => mod.mod.parent),
            parser: this.parser,
            resetParser: true,
        }
    }
    override restoreState(state: BackolonVMState) {
        state.moduleLoad.forEach((parent, i) => this.modcache[i]!.mod.parent = parent);
        if (state.resetParser) this.parser = state.parser;
    }
    modcache: ModuleCacheEntry[] = [];
    /**
     * Starts running the main module
     * @param url URL of the main module
     */
    override start(url: URL) {
        pushCommand(this, OP_do_import, null, true);
        pushData(this, url);
    }
    #modcacheGet(url: URL): [number, ModuleCacheEntry | undefined] {
        const i = this.modcache.findIndex(m => m.mod.id.href === url.href);
        return [i, this.modcache[i]];
    }
    getModule(url: URL) {
        return this.#modcacheGet(url)[1]?.mod;
    }
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
    fileIndex(url: URL) {
        const index = this.#modcacheGet(url)[0];
        return index < 0 ? undefined : index;
    }
    setSource(url: URL, src: string): SourceTracker | undefined {
        const i = this.#modcacheGet(url)[1];
        if (!i) {
            console.warn(`attempted to set source for module ${url} that has not yet been registered`);
            return;
        }
        return i.src = new SourceTracker(url, src, {});
    }
    registerSpan(span: Span): Location {
        const url = span.file;
        const mc = this.#modcacheGet(url)[1];
        if (!mc) {
            throw new JEBError(ErrnoCode.ENOENT);
        }
        return location([mc.map.push(span) - 1, this.fileIndex(url)]);
    }
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
    #createBuiltinsModule() {
        const env = this.builtinsEnv;
        this.createModule(new URL("backolon:builtins"), null).exports = Object.fromEntries(Object.keys(env.bindings).map(k => [k, new VariableReference(AccessType.PROPERTY, env, k)]));
    }
}

export const LOCATION_TAG = Symbol("__location__");

const location = (x: Location): Location => {
    (x as any)[LOCATION_TAG] = LOCATION_TAG;
    return x;
}
