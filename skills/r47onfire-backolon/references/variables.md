# Variables & Constants

## parser

### `NO_MATCH`
```ts
const NO_MATCH: typeof NO_MATCH
```

### `OP_runModule`
```ts
const OP_runModule: (vm: BackolonVM, __namedParameters: [SourceTracker]) => void
```

## runtime

### `OP_do_import`
```ts
const OP_do_import: (vm: BackolonVM, __namedParameters: [parent: Module | null, main?: boolean]) => void
```

### `MODULE_NAME`
Special symbol identifier used to identify module names that can't be shadowed.
```ts
const MODULE_NAME: typeof MODULE_NAME
```

### `MODULE_SELF`
Special symbol identifier used to link a module's environment back to the module
object itself
```ts
const MODULE_SELF: typeof MODULE_SELF
```

### `LOCATION_TAG`
```ts
const LOCATION_TAG: typeof LOCATION_TAG
```

## plugin

### `default`
[ESBuild](https://esbuild.github.io) or [Bun](https://bun.com) plugin that loads `.bk`
files as their Backolon AST.
```ts
const default: BunPlugin
```
