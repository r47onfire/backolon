# Classes

## parser

### `MatchFail`
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
```ts
constructor(): Finder
```
**Methods:**
- `match(url: URL): Finder | undefined`
- `stat(url: URL): Promise<boolean>`
- `getBytes(path: URL): Promise<Uint8Array<ArrayBufferLike>>`
- `getText(path: URL): Promise<string>`
- `getJSON(path: URL): Promise<JSONModule | JSONSourceMap>`
- `getImport(path: URL): Promise<JSModule>`

### `Importer`
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
- `getBytes(path: URL): Promise<Uint8Array<ArrayBufferLike>>`
- `getText(path: URL): Promise<string>`
- `getJSON(path: URL): Promise<JSONModule | JSONSourceMap>`
- `getImport(path: URL): Promise<JSModule>`

### `SourceTracker`
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
- `result: any`

### `Resolver`
```ts
constructor(): Resolver
```
**Methods:**
- `resolve(path: URL): Generator<URL, void, void>` — Resolves the module specifier to a concrete file or files
(e.g. if the given import had no extension, one must be chosen
based on what files exist).

### `IndexResolver`
*extends `Resolver`*
```ts
constructor(): IndexResolver
```
**Methods:**
- `resolve(path: URL): Generator<URL, void, unknown>` — Resolves the module specifier to a concrete file or files
(e.g. if the given import had no extension, one must be chosen
based on what files exist).

### `BackolonVM`
*extends `JebVM<BackolonVM>`*
```ts
constructor(importer: Importer): BackolonVM
```
**Properties:**
- `parser: any` — Current parser context - null if not parsing
- `importer: Importer`
- `modcache: ModuleCacheEntry[]`
**Methods:**
- `getState(): BackolonVMState`
- `restoreState(state: BackolonVMState): void`
- `start(url: URL): void` — Starts running the main module
- `getModule(url: URL): Module | undefined`
- `createModule(url: URL, parent: Module | null): Module`
- `setSource(url: URL, src: string): SourceTracker | undefined`
- `getSource(url: URL): string | undefined`
- `registerSpan(span: Span): Location`
- `getSpan(location: Location): Span`
- `tag(location: Location, tag: string): void`
