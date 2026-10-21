# Classes

## parser

### `MatchFail`
A failed match. `i` is the index where the failure occurred (used for
error reporting), `cut` is the remaining cut depth (Infinity for `die`),
and `expected` is the combinator that failed to match.
```ts
constructor(i: number, cut: number, expected: GrammarCombinator): MatchFail
```
**Properties:**
- `i: number`
- `cut: number`
- `expected: GrammarCombinator`

### `Span`
Source location information for a token.
```ts
constructor(file: Readonly<URL>, start: number, end: number): Span
```
**Properties:**
- `file: Readonly<URL>` — URL uniquely identifying the source that this span is from.
- `start: number` — Source index at which this span starts. (not line or column.)
- `end: number` — Source index at which this span ends.

## runtime

### `Finder`
A source of module files for a particular kind of URL (a filesystem,
an HTTP host, an in-memory map, ...).

Importer asks each registered `Finder` to match a URL;
the first non-undefined result becomes responsible for fetching that
URL's contents through the `get*` methods.
```ts
constructor(): Finder
```
**Methods:**
- `match(url: URL): Finder | undefined` — Returns the finder that serves `url` (usually `this`), or undefined
if this finder doesn't handle URLs like it.
- `stat(url: URL): Promise<boolean>` — Whether a file exists at `url`.
- `getBytes(path: URL): Promise<Uint8Array<ArrayBufferLike>>` — The raw bytes of the file at `path`. The base implementation just
throws; finders override the fetch methods for the URLs they serve.
- `getText(path: URL): Promise<string>` — The file at `path`, decoded as UTF-8 text.
- `getJSON(path: URL): Promise<JSONModule | JSONSourceMap>` — The file at `path`, parsed as JSON.
- `getImport(path: URL): Promise<JSModule>` — The file at `path`, imported as a Javascript module. Implemented by
fetching the source and importing it through a `data:` URL.

### `Importer`
Coordinates the whole module-loading pipeline: a Resolver
expands an import specifier into candidate URLs, Finders
fetch the winning candidate's contents, and a Loader turns
those contents into a running Module in the VM.
```ts
constructor(resolver: Resolver, finders: Finder[], loaders: Loader[]): Importer
```
**Properties:**
- `resolver: Resolver`
- `finders: Finder[]`
- `loaders: Loader[]`
**Methods:**
- `loadModule(vm: BackolonVM, parent: Module | null, path: URL, asMain: boolean): Promise<Module | typeof NOTHING>` — Pushes the required opcodes to the stack to load the module at the
given URL and leave the Module on the stack.
- `getBytes(path: URL): Promise<Uint8Array<ArrayBufferLike>>` — The raw bytes of the file at `path`, via the matching finder.
- `getText(path: URL): Promise<string>` — The file at `path` as text, via the matching finder.
- `getJSON(path: URL): Promise<JSONModule | JSONSourceMap>` — The file at `path`, parsed as JSON, via the matching finder.
- `getImport(path: URL): Promise<JSModule>` — The file at `path`, imported as a JS module, via the matching finder.

### `SourceTracker`
A module's source text, retained after loading so the parser can
report errors against it and tooling can syntax-highlight it.
`tags` maps a character index to the highlight tags for that position.
```ts
constructor(src: Readonly<URL>, code: string, tags: Record<number, string[]>): SourceTracker
```
**Properties:**
- `src: Readonly<URL>`
- `code: string`
- `tags: Record<number, string[]>`

### `Loader`
Object whose job it is to download or open the file
and then load its contents into a module object.
```ts
constructor(): Loader
```
**Methods:**
- `match(url: URL): Loader | undefined` — Returns undefined if this loader can't load the URL.
Returns itself or another loader that will load the module
via its load implementation.
- `load(vm: BackolonVM, url: URL, module: Module, importer: Importer): Promise<void>` — Called when this loader has been selected to load the given URL
into the given Module. Should push opcodes to do so.

### `JavascriptModuleLoader`
Loader that handles loading the Javascript modules via `import()`.
*extends `Loader`*
```ts
constructor(): JavascriptModuleLoader
```
**Methods:**
- `match(url: URL): Loader | undefined` — Returns undefined if this loader can't load the URL.
Returns itself or another loader that will load the module
via its load implementation.
- `load(vm: BackolonVM, url: URL, module: Module, importer: Importer): Promise<void>` — Called when this loader has been selected to load the given URL
into the given Module. Should push opcodes to do so.

### `BackolonSourceModuleLoader`
Loader that handles loading Backolon source code
*extends `Loader`*
```ts
constructor(): BackolonSourceModuleLoader
```
**Methods:**
- `match(url: URL): Loader | undefined` — Returns undefined if this loader can't load the URL.
Returns itself or another loader that will load the module
via its load implementation.
- `load(vm: BackolonVM, url: URL, module: Module, importer: Importer): Promise<void>` — Called when this loader has been selected to load the given URL
into the given Module. Should push opcodes to do so.

### `Module`
A Backolon module: one loaded (or still loading) source file, with its
own global environment, its identity URL, and its named exports.
Modules are created and cached by BackolonVM.createModule.
```ts
constructor(global: Env, id: URL, parent: Module | null): Module
```
**Properties:**
- `exports: Record<string, VariableReference>` — The named exports for the module
- `parent: Module | null` — This is used to detect and throw a "circular import!" error when
attempting to do something (access properties, etc) of a module
when it's not finished loading, as well as to avoid loading it when
it's already loaded
- `global: Env`
- `id: URL`
- `result: any` — The module's result value, once it has finished evaluating.

### `Resolver`
Strategy for turning an import specifier into candidate file URLs.
Implementations yield candidates in preference order; the importer
uses the first one the finder can actually read.
```ts
constructor(): Resolver
```
**Methods:**
- `resolve(path: URL): Generator<URL, void, void>` — Resolves the module specifier to a concrete file or files
(e.g. if the given import had no extension, one must be chosen
based on what files exist).

### `IndexResolver`
The default resolver: yields the path as-is, then with each known
module-file extension appended, then as a directory containing an
`index` file with each extension. The importer uses the first
candidate that actually exists.
*extends `Resolver`*
```ts
constructor(): IndexResolver
```
**Methods:**
- `resolve(path: URL): Generator<URL, void, unknown>` — Resolves the module specifier to a concrete file or files
(e.g. if the given import had no extension, one must be chosen
based on what files exist).

### `BackolonVM`
The JEB VM specialized for Backolon: on top of the base VM it keeps
the module cache, the current parser (if any), and the span tables
that map JEB Locations back to source ranges.
*extends `JebVM<BackolonVM>`*
```ts
constructor(importer: Importer): BackolonVM
```
**Properties:**
- `parser: any` — Current parser context - null if not parsing
- `importer: Importer`
- `modcache: ModuleCacheEntry[]` — All modules this VM knows about, in registration order. An entry's
index here is the second component of every Location
pointing into that module.
**Methods:**
- `getState(): BackolonVMState` — Captures the module `parent` links (and parser) for rollback.
- `restoreState(state: BackolonVMState): void` — Restores a state captured by getState; the parser is always reset to the captured one.
- `start(url: URL): void` — Starts running the main module
- `getModule(url: URL): Module | undefined` — The registered module for `url`, or undefined if it was never created.
- `createModule(url: URL, parent: Module | null): Module` — Creates a module for `url` -- with a fresh global environment nested
inside the builtins environment -- and registers it in the cache.
Throws if a module for `url` already exists.
- `setSource(url: URL, src: string): SourceTracker | undefined` — Records the source text of an already-registered module and returns
its tracker. If the module isn't registered, warns and returns
undefined instead.
- `getSource(url: URL): string | undefined` — The recorded source text of the module at `url`, if any.
- `registerSpan(span: Span): Location` — Registers a source span with its module and returns the opaque
Location (span index, module index) that represents it
elsewhere in the VM. Throws if the span's module isn't registered.
- `getSpan(location: Location): Span` — Resolves a Location back to the span it was registered from.
- `tag(location: Location, tag: string): void` — Adds a syntax-highlight tag to every character position covered by
the span at `location`, in that module's SourceTracker.
Unknown locations and source-less modules are ignored (with a
warning), since highlighting is best-effort.
