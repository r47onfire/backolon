import { isinstance } from "@r47onfire/game-math";
import { ErrnoCode, JEBError, makeOpcode, NOTHING, peekData, popData, promisifyVM, pushData, theTypeName, typeOf } from "@r47onfire/jeb";
import { Finder } from "./finder";
import { JSModule, JSONModule, JSONSourceMap } from "./jsmod";
import { BackolonSourceModuleLoader, JavascriptModuleLoader, Loader } from "./loader";
import { Module, MODULE_NAME } from "./module";
import { Resolver } from "./resolver";
import { BackolonVM } from "./vm";

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
        const m = vm.modules[path.href];
        if (m) {
            if (asMain) {
                throw new JEBError(ErrnoCode.EALREADY, "tried to run already-imported module as main");
            }
            if (m.parent) {
                // TODO: use error notes with cycle participants
                var m2: Module | null | boolean = parent, culprits: string[] = [];
                while (isinstance(m2, Module) && m2 !== m) {
                    culprits.push(m2.id.href);
                    m2 = m2.parent;
                }
                throw new JEBError(ErrnoCode.EALREADY, `circular import of module ${path.href} (<- ${culprits.join(" <- ")})`);
            }
            pushData(vm, m);
            return NOTHING;
        }
        for (var resolved of this.resolver.resolve(path)) {
            // TODO: continue if file not found
            for (var loader of this.loaders) {
                const g = loader.match(resolved);
                if (g) {
                    const env = vm.createEnv(vm.builtinsEnv);
                    env.addConst("__main__", asMain);
                    env.addConst(MODULE_NAME, resolved);
                    const module = vm.modules[resolved.href] = new Module(env, resolved, parent);
                    vm.pushCommand(OP_cleanup_module, resolved);
                    await g.load(vm, resolved, module, this);
                    return NOTHING;
                }
            }
        }
        throw new JEBError(ErrnoCode.ENOPROTOOPT, `don't know how to load module from ${path.href}`);
    }
    #get<T extends "getBytes" | "getText" | "getJSON" | "getImport">(path: URL, method: T): ReturnType<Finder[T]> {
        for (var finder of this.finders) {
            const f = finder.match(path);
            if (f) return f[method](path) as any;
        }
        throw new JEBError(ErrnoCode.ENOPROTOOPT, `don't know how to load file from ${path.href}`);
    }
    getBytes(path: URL): Promise<Uint8Array> {
        return this.#get(path, "getBytes");
    }
    getText(path: URL): Promise<string> {
        return this.#get(path, "getText");
    }
    getJSON(path: URL): Promise<JSONModule | JSONSourceMap> {
        return this.#get(path, "getJSON");
    }
    getImport(path: URL): Promise<JSModule> {
        return this.#get(path, "getImport");
    }
}

export class SourceTracker {
    constructor(
        readonly src: Readonly<URL>,
        readonly code: string,
        readonly tags: Record<number, string[]>,
    ) { }
}

export const OP_do_import = makeOpcode("import", (vm: BackolonVM, { 0: parent, 1: asMain }: [parent: Module | null, main?: boolean]) => {
    const url = popData(vm);
    if (!isinstance(url, URL)) {
        throw new JEBError(ErrnoCode.EINVAL, "Module import source must be an absolute URL");
    }
    promisifyVM(vm, vm.importer.loadModule(vm, parent, url, asMain ?? false));
}, "..");

const OP_cleanup_module = makeOpcode(null, (vm: BackolonVM, { 0: url }: [URL]) => {
    const module = peekData(vm);
    if (!isinstance(module, Module)) {
        throw new JEBError(ErrnoCode.EPANIC, `Loader didn't properly load ${url.href}!! Got a ${theTypeName(typeOf(module))}`)
    }
    module.parent = null;
}, null);
