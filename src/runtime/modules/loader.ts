import type { Importer } from "./importer";
import type { Module } from "./module";
import type { BackolonVM, Task, TaskGen } from "../vm";
import { LinkedList } from "@r47onfire/game-math";
import type { Env } from "../env";
import { StackTreeNode } from "../../errors";
import { TryCatchHandler } from "../trycatch";

/**
 * Object whose job it is to download or open the file and then load its
 * contents into a module object.
 */
export abstract class Loader {
    /**
     * Returns itself or another loader that will load the module via its
     * {@link load} implementation, or undefined if this loader doesn't know how
     * to load this URL.
     */
    abstract match(url: URL): Loader | undefined;
    /**
     * Called when this loader has been selected to load the given URL into the
     * given {@link Module}. Should push opcodes to do so.
     */
    abstract load(
        task: Task,
        env: Env,
        module: Module,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        url: URL,
        importer: Importer,
    ): TaskGen<void>;
}

/** Loader that handles loading the Javascript modules via `import()`. */
export class JavascriptModuleLoader extends Loader {
    match(url: URL): Loader | undefined {
        if (url.pathname.endsWith(".js")) return this;
    }
    *load(
        task: Task,
        env: Env,
        module: Module,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        url: URL,
        importer: Importer,
    ) {
        yield* (yield* importer.getImport(
            task,
            env,
            traceback,
            handlers,
            url,
        )).setup(module, url.searchParams, task.vm);
    }
}

// /**
//  * Loader that handles loading compiled / pre-parsed JSON modules
//  */
// export class JSONModuleLoader extends Loader {
//     match(url: URL): Loader | undefined {
//         if (url.pathname.endsWith(".bk.json")) return this;
//     }
//     *load(
//         task: Task,
//         env: Env,
//         module: Module,
//         traceback: LinkedList<StackTreeNode>,
//         handlers: LinkedList<TryCatchHandler>,
//         url: URL,
//         importer: Importer,
//     ) {
//         const code = yield* importer.getJSON(task, env, traceback, handlers, url);
//         return yield* task.eval(code, module, traceback, handlers, []);
//     }
// }

/** Loader that handles loading Backolon source code */
export class BackolonSourceModuleLoader extends Loader {
    match(url: URL): Loader | undefined {
        if (url.pathname.endsWith(".bk")) return this;
    }
    *load(
        task: Task,
        env: Env,
        module: Module,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        url: URL,
        importer: Importer,
    ) {
        const text = yield* importer.getText(
            task,
            env,
            traceback,
            handlers,
            url,
        );
        throw new Error("text");
    }
}
