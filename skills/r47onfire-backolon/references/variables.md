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

### `B_Parser_test`
```ts
const B_Parser_test: JSFun<JebVM<any>, CallableSignatureFromShorthand<["what"]>>
```

### `B_Parser_expect`
```ts
const B_Parser_expect: JSFun<JebVM<any>, CallableSignatureFromShorthand<["what"]>>
```

### `B_Parser_save`
```ts
const B_Parser_save: JSFun<JebVM<any>, CallableSignatureFromShorthand<[]>>
```

### `B_Parser_restore`
```ts
const B_Parser_restore: JSFun<JebVM<any>, CallableSignatureFromShorthand<["state"]>>
```

### `B_Parser_isMatch`
```ts
const B_Parser_isMatch: JSFun<JebVM<any>, CallableSignatureFromShorthand<["ast"]>>
```

### `B_Parser_addSpan`
```ts
const B_Parser_addSpan: JSFun<JebVM<any>, CallableSignatureFromShorthand<["start", "end"]>>
```

### `B_Parser_tag`
```ts
const B_Parser_tag: JSFun<JebVM<any>, CallableSignatureFromShorthand<["span", "tag"]>>
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
