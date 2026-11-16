import { parse } from "lib0/json";
import { TaskGen } from "../vm";
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
    abstract stat(url: URL): TaskGen<boolean>;
    /**
     * The raw bytes of the file at `path`. The base implementation just throws;
     * finders override the fetch methods for the URLs they serve.
     */
    *getBytes(path: URL): TaskGen<Uint8Array> {
        throw new Error("getBytes() not implemented");
    }
    /** The file at `path`, decoded as UTF-8 text. */
    *getText(path: URL): TaskGen<string> {
        return defaultDecoder.decode(yield* this.getBytes(path));
    }
    /** The file at `path`, parsed as JSON. */
    *getJSON(path: URL): TaskGen<JSONModule | JSONSourceMap> {
        return parse(yield* this.getText(path));
    }
    /**
     * The file at `path`, imported as a Javascript module. Implemented by
     * getting the source using {@link getText} and importing it through a
     * `data:` URL, so the file will not be able to import other modules unless
     * this hook is overridden.
     */
    *getImport(path: URL): TaskGen<JSModule> {
        return yield import(
            `data:text/javascript;charset=utf-8,${encodeURIComponent(yield* this.getText(path))}`
        );
    }
}
