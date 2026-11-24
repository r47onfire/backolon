import { LinkedList } from "@r47onfire/game-math";
import { CSTNode } from "@r47onfire/nebula";
import { StackTreeNode } from "../../errors";
import {
    CircularImportError,
    ImportError,
    ModuleNotFoundError,
} from "../../errors/classes";
import type { Env } from "../env";
import { handleError, TryCatchHandler } from "../trycatch";
import type { Task, TaskGen } from "../vm";
import { Finder } from "./finder";
import { JSModule } from "./jsmod";
import {
    BackolonSourceModuleLoader,
    JavascriptModuleLoader,
    Loader,
} from "./loader";
import { Module } from "./module";
import { Resolver } from "./resolver";

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
    ) { }
    /**
     * Pushes the required opcodes to the stack to load the module at the given
     * URL and leave the {@link Module} on the stack.
     */
    *loadModule(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        parent: Module | null,
        path: URL,
        asMain: boolean,
    ): TaskGen<Module> {
        for (let resolved of this.resolver.resolve(path)) {
            let m = task.vm.getModule(resolved);
            if (m) {
                if (asMain) {
                    return yield* handleError(
                        task,
                        env,
                        traceback,
                        handlers,
                        new CircularImportError("backolon.import.main_cycle"),
                    );
                }
                if (m.parent) {
                    let m2: Module | null | boolean = parent;
                    const culprits: Module[] = [m];
                    while (m2 instanceof Module && m2 !== m) {
                        culprits.push(m2);
                        m2 = m2.parent;
                    }
                    return yield* handleError(
                        task,
                        env,
                        traceback,
                        handlers,
                        new CircularImportError(
                            "backolon.import.circular",
                            [culprits],
                        ),
                    );
                }
                return m;
            }
            if (
                yield* this.#get(
                    task,
                    env,
                    traceback,
                    handlers,
                    resolved,
                    "stat",
                )
            ) {
                for (let loader of this.loaders) {
                    const g = loader.match(resolved);
                    if (g) {
                        m = task.vm.createAndCacheModule(resolved, parent);
                        m.addUnshadowableFast("__main__", asMain);
                        yield* g.load(
                            task,
                            env,
                            m,
                            traceback,
                            handlers,
                            resolved,
                            this,
                        );
                        m.parent = null;
                        return m;
                    }
                }
            }
        }
        return (yield* handleError(
            task,
            env,
            traceback,
            handlers,
            new ModuleNotFoundError("backolon.import.not_found", [path]),
        )) as Module;
    }
    /**
     * Dispatches a fetch operation to the first finder that
     * {@link Finder.match matches} `path`. If no finder does, the
     * ModuleNotFoundError goes through {@link handleError}: a handler that
     * resumes supplies the value the fetch would have produced.
     */
    *#get<T extends "getBytes" | "getText" | "getJSON" | "getImport" | "stat">(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        path: URL,
        method: T,
    ): TaskGen<any> {
        for (let finder of this.finders) {
            const f = finder.match(path);
            if (f)
                return yield* f[method](
                    task,
                    env,
                    traceback,
                    handlers,
                    path,
                ) as any;
        }
        return yield* handleError(
            task,
            env,
            traceback,
            handlers,
            new ImportError("backolon.import.unresolvable", [path]),
        ) as any;
    }
    /** The raw bytes of the file at `path`, via the matching finder. */
    *getBytes(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        path: URL,
    ): TaskGen<Uint8Array> {
        return yield* this.#get(
            task,
            env,
            traceback,
            handlers,
            path,
            "getBytes",
        );
    }
    /** The file at `path` as text, via the matching finder. */
    *getText(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        path: URL,
    ): TaskGen<string> {
        return yield* this.#get(
            task,
            env,
            traceback,
            handlers,
            path,
            "getText",
        );
    }
    /** The file at `path`, parsed as JSON, via the matching finder. */
    *getJSON(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        path: URL,
    ): TaskGen<CSTNode<any>> {
        return yield* this.#get(
            task,
            env,
            traceback,
            handlers,
            path,
            "getJSON",
        );
    }
    /** The file at `path`, imported as a JS module, via the matching finder. */
    *getImport(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        path: URL,
    ): TaskGen<JSModule> {
        return yield* this.#get(
            task,
            env,
            traceback,
            handlers,
            path,
            "getImport",
        );
    }
}
