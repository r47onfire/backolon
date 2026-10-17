import { ErrnoCode, JEBError, makeOpcode, NOTHING, peekData, popData, promisifyVM, theTypeName, typeOf } from "@r47onfire/jeb";
import { Finder } from "./finder";
import { JSModule, JSONModule, JSONSourceMap } from "./jsmod";
import { BackolonSourceModuleLoader, JavascriptModuleLoader, Loader } from "./loader";
import { Module } from "./module";
import { Resolver } from "./resolver";
import { BackolonVM } from "./vm";

/**
 * Coordinates the whole module-loading pipeline: a {@link Resolver}
 * expands an import specifier into candidate URLs, {@link Finder}s
 * fetch the winning candidate's contents, and a {@link Loader} turns
 * those contents into a running {@link Module} in the VM.
 */
export class Importer {
    constructor(
        public resolver: Resolver,
        public finders: Finder[],
        public loaders: Loader[] = [
            new JavascriptModuleLoader(),
            // new JSONModuleLoader(),
            new BackolonSourceModuleLoader(),
        ],
    ) { }
    /**
     * Pushes the required opcodes to the stack to load the module at the
     * given URL and leave the {@link Module} on the stack.
     */
    async loadModule(vm: BackolonVM, parent: Module | null, path: URL, asMain: boolean) {
        for (var resolved of this.resolver.resolve(path)) {
            var m = vm.getModule(resolved);
            if (m) {
                if (asMain) {
                    throw new JEBError(ErrnoCode.EEXIST, "tried to run already-imported module as main");
                }
                if (m.parent) {
                    // TODO: use error notes with cycle participants
                    var m2: Module | null | boolean = parent, culprits: string[] = [];
                    while (m2 instanceof Module && m2 !== m) {
                        culprits.push(m2.id.href);
                        m2 = m2.parent;
                    }
                    throw new JEBError(ErrnoCode.EALREADY, `circular import of module ${path.href} (<- ${culprits.join(" <- ")})`);
                }
                return m;
            }
            if (await this.#get(resolved, "stat")) {
                for (var loader of this.loaders) {
                    const g = loader.match(resolved);
                    if (g) {
                        m = vm.createModule(resolved, parent);
                        m.global.addConst("__main__", asMain);
                        vm.pushCommand(OP_cleanup_module, resolved);
                        await g.load(vm, resolved, m, this);
                        return NOTHING;
                    }
                }
            }
        }
        throw new JEBError(ErrnoCode.ENOPROTOOPT, `don't know how to load module from ${path.href}`);
    }
    /**
     * Dispatches a fetch operation to the first finder that
     * {@link Finder.match matches} `path`. Throws if no finder does.
     */
    #get<T extends "getBytes" | "getText" | "getJSON" | "getImport" | "stat">(path: URL, method: T): ReturnType<Finder[T]> {
        for (var finder of this.finders) {
            const f = finder.match(path);
            if (f) return f[method](path) as any;
        }
        throw new JEBError(ErrnoCode.ENOPROTOOPT, `don't know how to load file from ${path.href}`);
    }
    /** The raw bytes of the file at `path`, via the matching finder. */
    getBytes(path: URL): Promise<Uint8Array> {
        return this.#get(path, "getBytes");
    }
    /** The file at `path` as text, via the matching finder. */
    getText(path: URL): Promise<string> {
        return this.#get(path, "getText");
    }
    /** The file at `path`, parsed as JSON, via the matching finder. */
    getJSON(path: URL): Promise<JSONModule | JSONSourceMap> {
        return this.#get(path, "getJSON");
    }
    /** The file at `path`, imported as a JS module, via the matching finder. */
    getImport(path: URL): Promise<JSModule> {
        return this.#get(path, "getImport");
    }
}

/**
 * A module's source text, retained after loading so the parser can
 * report errors against it and tooling can syntax-highlight it.
 * `tags` maps a character index to the highlight tags for that position.
 */
export class SourceTracker {
    constructor(
        readonly src: Readonly<URL>,
        readonly code: string,
        readonly tags: Record<number, string[]>,
    ) { }
}

/**
 * The `import` opcode: pops an absolute URL off the data stack and loads
 * that module (running it as the main module if `asMain` is set). The
 * load is asynchronous, so the VM is suspended until it completes.
 */
export const OP_do_import = makeOpcode("import", (vm: BackolonVM, { 0: parent, 1: asMain }: [parent: Module | null, main?: boolean]) => {
    const url = popData(vm);
    if (!(url instanceof URL)) {
        throw new JEBError(ErrnoCode.EINVAL, "Module import source must be an absolute URL");
    }
    promisifyVM(vm, vm.importer.loadModule(vm, parent, url, asMain ?? false));
}, "..");

/**
 * Pushed by {@link Importer.loadModule} to run once a module's loader
 * finishes: checks the loader actually left the {@link Module} on the
 * stack, then clears its `parent` link, marking it fully loaded (so
 * later imports of it are no longer treated as circular).
 */
const OP_cleanup_module = makeOpcode(null, (vm: BackolonVM, { 0: url }: [URL]) => {
    const module = peekData(vm);
    if (!(module instanceof Module)) {
        throw new JEBError(ErrnoCode.EPANIC, `Loader didn't properly load ${url.href}!! Got a ${theTypeName(typeOf(module))}`)
    }
    module.parent = null;
}, null);
