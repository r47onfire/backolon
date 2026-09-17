import { JebVM, Location, pushCommand, pushData } from "@r47onfire/jeb";
import { Parser } from "../parser";
import { Span } from "../parser/span";
import { Importer, OP_do_import, SourceTracker } from "./importer";
import { Module } from "./module";

interface BackolonVMState {
    moduleLoad: [string, parent: Module | null][];
    parser: Parser | null;
    resetParser: boolean;
}

export class BackolonVM extends JebVM<BackolonVM> {
    /** Current parser context - null if not parsing */
    parser: Parser | null = null;
    constructor(public importer: Importer) {
        super();
    }
    override getState(): BackolonVMState {
        return {
            moduleLoad: Object.entries(this.modules ?? {}).map(({ 0: name, 1: mod }) => [name, mod.parent] as const),
            parser: this.parser,
            resetParser: true,
        }
    }
    override restoreState(state: BackolonVMState) {
        state.moduleLoad.forEach(({ 0: name, 1: parent }) => this.modules[name]!.parent = parent);
        if (state.resetParser) this.parser = state.parser;
    }
    /** Module cache */
    modules: Record<string, Module> = {};
    /** Mapping of URL to source tracker */
    sources: Record<string, SourceTracker> = {};
    /** Mapping of module name to a list of location IDs (for the JEB `at` identifier function) to the actual {@link Span} */
    maps: Record<string, Span[]> = {};
    /** For keeping track of all files indexes in {@link maps} */
    files = new Map<string, number>();
    /**
     * Starts running the main module
     * @param url URL of the main module
     */
    override start(url: URL) {
        pushCommand(this, OP_do_import, null, true);
        pushData(this, url);
    }
    fileIndex(url: URL) {
        return this.files.getOrInsert(url.href, this.files.size);
    }
    registerSource(url: URL, src: string): SourceTracker {
        return this.sources[url.href] = new SourceTracker(url, src, {});
    }
    registerSpan(span: Span): Location {
        const url = span.file;
        return location([(this.maps[url.href] ??= []).push(span) - 1, this.fileIndex(url)]);
    }
}

export const LOCATION_TAG = Symbol("__location__");

const location = (x: Location): Location => {
    (x as any)[LOCATION_TAG] = LOCATION_TAG;
    return x;
}
