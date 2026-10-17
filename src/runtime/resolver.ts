export abstract class Resolver {
    /**
     * Resolves the module specifier to a concrete file or files
     * (e.g. if the given import had no extension, one must be chosen
     * based on what files exist).
     */
    abstract resolve(path: URL): Generator<URL, void, void>;
}

/**
 * The default resolver: yields the path as-is, then with each known
 * module-file extension appended, then as a directory containing an
 * `index` file with each extension. The importer uses the first
 * candidate that actually exists.
 */
export class IndexResolver extends Resolver {
    *resolve(path: URL) {
        yield path;
        yield pathAppend(path, ".bk");
        yield pathAppend(path, ".bk.json");
        yield pathAppend(path, ".min.js");
        yield pathAppend(path, ".js");
        yield pathAppend(path, "/index.bk");
        yield pathAppend(path, "/index.bk.json");
        yield pathAppend(path, "/index.min.js");
        yield pathAppend(path, "/index.js");
    }
}

const pathAppend = (url: URL, extension: string) => {
    const copy = new URL(url);
    copy.pathname += extension;
    return copy;
}
