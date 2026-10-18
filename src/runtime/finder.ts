import { parse } from "lib0/json";
import { JSModule, JSONModule, JSONSourceMap } from "./jsmod";

const defaultDecoder = new TextDecoder();

/**
 * A source of module files for a particular kind of URL (a filesystem,
 * an HTTP host, an in-memory map, ...).
 *
 * {@link Importer} asks each registered `Finder` to {@link match} a URL;
 * the first non-undefined result becomes responsible for fetching that
 * URL's contents through the `get*` methods.
 */
export abstract class Finder {
    /**
     * Returns the finder that serves `url` (usually `this`), or undefined
     * if this finder doesn't handle URLs like it.
     */
    abstract match(url: URL): Finder | undefined;
    /** Whether a file exists at `url`. */
    abstract stat(url: URL): Promise<boolean>;
    /**
     * The raw bytes of the file at `path`. The base implementation just
     * throws; finders override the fetch methods for the URLs they serve.
     */
    async getBytes(path: URL): Promise<Uint8Array> {
        throw new Error("getBytes() not implemented");
    }
    /** The file at `path`, decoded as UTF-8 text. */
    async getText(path: URL): Promise<string> {
        return defaultDecoder.decode(await this.getBytes(path));
    }
    /** The file at `path`, parsed as JSON. */
    async getJSON(path: URL): Promise<JSONModule | JSONSourceMap> {
        return parse(await this.getText(path));
    }
    /**
     * The file at `path`, imported as a Javascript module. Implemented by
     * fetching the source and importing it through a `data:` URL.
     */
    async getImport(path: URL): Promise<JSModule> {
        return await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(await this.getText(path))}`);
    }
}
