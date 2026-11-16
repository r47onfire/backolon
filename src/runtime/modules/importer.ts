import { CircularImportError, ModuleNotFoundError } from "../../errors/classes";
import { Finder } from "./finder";
import { JSModule, JSONModule, JSONSourceMap } from "./jsmod";
import {
    BackolonSourceModuleLoader,
    JavascriptModuleLoader,
    Loader,
} from "./loader";
import { Module } from "./module";
import { Resolver } from "./resolver";
import { BackolonVM, TaskGen } from "../vm";

/**
 * Coordinates the whole module-loading pipeline: a {@link Resolver} expands an
 * import specifier into candidate URLs, {@link Finder}s fetch the winning
 * candidate's contents, and a {@link Loader} turns those contents into a running
 * {@link Module} in the VM.
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
    ) {}
    /**
     * Pushes the required opcodes to the stack to load the module at the given
     * URL and leave the {@link Module} on the stack.
     */
    *loadModule(
        vm: BackolonVM,
        parent: Module | null,
        path: URL,
        asMain: boolean,
    ): TaskGen<Module> {
        for (let resolved of this.resolver.resolve(path)) {
            let m = vm.getModule(resolved);
            if (m) {
                if (asMain) {
                    throw new CircularImportError("backolon.import.main_cycle");
                }
                if (m.parent) {
                    let m2: Module | null | boolean = parent,
                        culprits: Module[] = [m];
                    while (m2 instanceof Module && m2 !== m) {
                        culprits.push(m2);
                        m2 = m2.parent;
                    }
                    throw new CircularImportError(
                        "backolon.import.circular",
                        culprits,
                    );
                }
                return m;
            }
            if (yield* this.#get(resolved, "stat")) {
                for (let loader of this.loaders) {
                    const g = loader.match(resolved);
                    if (g) {
                        m = vm.createModule(resolved, parent);
                        m.addConst("__main__", asMain);
                        yield* g.load(vm, resolved, m, this);
                        m.parent = null;
                        return m;
                    }
                }
            }
        }
        throw new ModuleNotFoundError("backolon.import.not_found", path);
    }
    /**
     * Dispatches a fetch operation to the first finder that
     * {@link Finder.match matches} `path`. Throws if no finder does.
     */
    #get<T extends "getBytes" | "getText" | "getJSON" | "getImport" | "stat">(
        path: URL,
        method: T,
    ): ReturnType<Finder[T]> {
        for (let finder of this.finders) {
            const f = finder.match(path);
            if (f) return f[method](path) as any;
        }
        throw new ModuleNotFoundError(
            "backolon.import.unresolvable",
            path.href,
        );
    }
    /** The raw bytes of the file at `path`, via the matching finder. */
    *getBytes(path: URL): TaskGen<Uint8Array> {
        return yield* this.#get(path, "getBytes");
    }
    /** The file at `path` as text, via the matching finder. */
    *getText(path: URL): TaskGen<string> {
        return yield* this.#get(path, "getText");
    }
    /** The file at `path`, parsed as JSON, via the matching finder. */
    *getJSON(path: URL): TaskGen<JSONModule | JSONSourceMap> {
        return yield* this.#get(path, "getJSON");
    }
    /** The file at `path`, imported as a JS module, via the matching finder. */
    *getImport(path: URL): TaskGen<JSModule> {
        return yield* this.#get(path, "getImport");
    }
}
