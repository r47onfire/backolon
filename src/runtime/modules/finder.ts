import type { LinkedList } from "@r47onfire/game-math";
import { parse } from "lib0/json";
import type { StackTreeNode } from "../../errors";
import type { Env } from "../env";
import type { TryCatchHandler } from "../trycatch";
import type { Task, TaskGen } from "../vm";
import type { Importer } from "./importer";
import { JSModule, JSONModule, JSONSourceMap } from "./jsmod";

const defaultDecoder = new TextDecoder();

/**
 * A source of module files for a particular kind of URL (a filesystem, an HTTP
 * host, an in-memory map, ...).
 *
 * {@link Importer} asks each registered `Finder` to {@link match} a URL; the
 * first non-undefined result becomes responsible for fetching that URL's
 * contents through the `get*` methods.
 */
export abstract class Finder {
    /**
     * Returns the finder that serves `url` (usually `this`), or undefined if
     * this finder doesn't handle URLs like it.
     */
    abstract match(url: URL): Finder | undefined;
    /** Whether a file exists at `url`. */
    abstract stat(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        url: URL,
    ): TaskGen<boolean>;
    /**
     * The raw bytes of the file at `path`. The base implementation just throws;
     * finders override the fetch methods for the URLs they serve.
     */
    *getBytes(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        path: URL,
    ): TaskGen<Uint8Array> {
        throw new Error("getBytes() not implemented");
    }
    /** The file at `path`, decoded as UTF-8 text. */
    *getText(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        path: URL,
    ): TaskGen<string> {
        return defaultDecoder.decode(
            yield* this.getBytes(task, env, traceback, handlers, path),
        );
    }
    /** The file at `path`, parsed as JSON. */
    *getJSON(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        path: URL,
    ): TaskGen<JSONModule | JSONSourceMap> {
        return parse(yield* this.getText(task, env, traceback, handlers, path));
    }
    /**
     * The file at `path`, imported as a Javascript module. By default, this
     * `import()`s the given URL directly, without going through other methods,
     * and relies on the Javascript engine's ability to find and load the file.
     */
    *getImport(
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
        path: URL,
    ): TaskGen<JSModule> {
        return yield import(path.href);
    }
}
