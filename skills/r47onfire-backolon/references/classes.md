# Classes

## parser

### `Token`
```ts
constructor(text: string, location: Location): Token
```
**Properties:**
- `text: string`
- `location: Location`

### `Parser`
Parser state; functionally immutable but contains some internal memoization
tables that are computed when needed.
```ts
constructor(source: SourceTracker, index: number, parselets: Parselet[], constraints: readonly Constraint<Parselet>[]): Parser
```
**Properties:**
- `source: SourceTracker`
- `index: number`
- `parselets: Parselet[]`
- `constraints: readonly Constraint<Parselet>[]`
- `precedenceOf: Map<Parselet, number>`
**Methods:**
- `addParselet(parselet: Parselet): Parser`
- `addConstraint(constraint: Constraint<Parselet>): Parser`
- `isEOF(): boolean`
- `commitToken(vm: BackolonVM, match: RegExpExecArray): Token`
- `test(regex: string | RegExp): RegExpExecArray | null`
- `peek(vm: BackolonVM, startIndex: number, maxPrecedence: number, orEqual: boolean): [parselet: Parselet, token: Token, nextIndex: number] | undefined`
- `precedence(): number`
- `advance(by: number): Parser`

### `Parselet`
```ts
constructor(prefix: string | RegExp, parse: any): Parselet
```
**Properties:**
- `prefix: RegExp` — It always has the sticky (y) flag.
- `parse: any` — This is a JEB callable (builtin, lambda, etc) of one argument that implements the parse
handler of the parselet.

For a prefix position, context.left is undefined, and context.first is true.

For an infix position, context.left is the left-side expression, and context.first is false.

In either case the parse function must return a chunk of JEB code that implements the
parse result, call `context.skip()` to mark what it has parsed as insignificant (`skip`
is a continuation which doesn't return), or call `context.discard()`
which goes to the next token.

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
- `loadModule(vm: BackolonVM, parent: Module | null, path: URL, asMain: boolean): Promise<symbol>` — Pushes the required opcodes to the stack to load the module at the
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
- `parselets: Parselet[]` — The saved parselets list at the end of the module body.
- `constraints: Constraint<Parselet>[]`
- `exports: Record<string, VariableReference>` — The named exports for the module
- `parent: Module | null` — This is used to detect and throw a "circular import!" error when
attempting to do something (access properties, etc) of a module
when it's not finished loading, as well as to avoid loading it when
it's already loaded
- `global: Env`
- `id: URL`

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
- `parser: Parser | null` — Current parser context - null if not parsing
- `importer: Importer`
- `modules: Record<string, Module>` — Module cache
- `sources: Record<string, SourceTracker>` — Mapping of URL to source tracker
- `maps: Record<string, Span[]>` — Mapping of module name to a list of location IDs (for the JEB `at` identifier function) to the actual Span
- `files: Map<string, number>` — For keeping track of all files indexes in maps
**Methods:**
- `getState(): BackolonVMState`
- `restoreState(state: BackolonVMState): void`
- `start(url: URL): void` — Starts running the main module
- `fileIndex(url: URL): number`
- `registerSource(url: URL, src: string): SourceTracker`
- `registerSpan(span: Span): Location`
