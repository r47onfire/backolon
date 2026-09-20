import { Continuation, OP_apply, pushCommand, pushData } from "@r47onfire/jeb";
import { Importer } from "./importer";
import { Module } from "./module";
import { BackolonVM } from "./vm";
import { OP_runModule } from "../parser";
import { OP_setupModuleGlobals } from "../stdlib/core";

/**
 * Object whose job it is to download or open the file
 * and then load its contents into a module object.
 */
export abstract class Loader {
    /**
     * Returns undefined if this loader can't load the URL.
     * Returns itself or another loader that will load the module
     * via its {@link load} implementation.
     */
    abstract match(url: URL): Loader | undefined;
    /**
     * Called when this loader has been selected to load the given URL
     * into the given {@link Module}. Should push opcodes to do so.
     */
    abstract load(vm: BackolonVM, url: URL, module: Module, importer: Importer): Promise<void>;
}

/**
 * Loader that handles loading the Javascript modules via `import()`.
 */
export class JavascriptModuleLoader extends Loader {
    match(url: URL): Loader | undefined {
        if (url.pathname.endsWith(".js")) return this;
    }
    async load(vm: BackolonVM, url: URL, module: Module, importer: Importer) {
        await (await importer.getImport(url)).setup(module, url.searchParams, vm);
    }
}

// /**
//  * Loader that handles loading compiled / pre-parsed JSON modules
//  */
// export class JSONModuleLoader extends Loader {
//     match(url: URL): Loader | undefined {
//         if (url.pathname.endsWith(".bk.json")) return this;
//     }
//     async load(vm: BackolonVM, url: URL, module: Module, importer: Importer) {
//         var { code, sourceMap, files } = await importer.getJSON(url) as JSONModule;
//         vm.currentEnv = module.global;
//         const absFiles = files.map(f => new URL(f, url));
//         // TODO: make the data be sloinked and use sloink to rewrite the tagged indices on load time
//         if (sourceMap && files) {
//             absFiles.forEach(f => vm.fileIndex(f));
//             (importer.getJSON(new URL(sourceMap, url)) as Promise<JSONSourceMap>).then(({ mappings, contents }) => {
//                 return absFiles.forEach((f, i) => {
//                     vm.maps[f.href] = mappings[i]!.map(({ 0: start, 1: end }) => new Span(f, start, end));
//                     return vm.sources[f.href] = new SourceTracker(f, contents[i]!, {});
//                 });
//             });
//         }
//         pushCommand(vm, OP_set_env, vm.currentEnv);
//         pushCommand(vm, OP_eval, undefined);
//         pushData(vm, code);
//     }
// }

/**
 * Loader that handles loading Backolon source code
 */
export class BackolonSourceModuleLoader extends Loader {
    match(url: URL): Loader | undefined {
        if (url.pathname.endsWith(".bk")) return this;
    }
    async load(vm: BackolonVM, url: URL, module: Module, importer: Importer) {
        const text = await importer.getText(url);
        pushData(vm, new Continuation(vm, []));
        pushCommand(vm, OP_apply, [module], undefined, true, true);
        pushCommand(vm, OP_runModule, vm.setSource(url, text)!);
        pushCommand(vm, OP_setupModuleGlobals);
        vm.currentEnv = module.global;
    }
}
