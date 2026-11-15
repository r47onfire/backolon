# Variables & Constants

## parser

### `backolonGrammar`
The Backolon grammar, as plain combinator data.

The expression rules form a precedence chain from loosest to tightest:

- Expr
- Cascade
- Pipe
- Implicit_call
- Kw_arg
- Assign_rev
- Assignment
- Ternary
- Logical
- Comparison
- Predicate
- Containment
- Bitwise
- Bitshift
- Sum
- Term
- Factor
- Indexing
- Primary

Binary levels are written left-recursively (the parser grows the recursion),
and after matching an operator each level first checks a negative lookahead
on `assign_op` -- so `a += b` is not misread as a binary `+` followed by a
prefix `=` assignment -- and then cuts to commit the level.
```ts
const backolonGrammar: Grammar
```

### `all_tags`
Every highlight tag name used anywhere in backolonGrammar, collected
by walking all of its combinator trees (e.g. for building a syntax-highlight
theme).
```ts
const all_tags: Set<any>
```

## runtime

### `OP_do_import`
The `import` opcode: pops an absolute URL off the data stack and loads that
module (running it as the main module if `asMain` is set). The load is
asynchronous, so the VM is suspended until it completes.
```ts
const OP_do_import: any
```

### `MODULE_NAME`
Special symbol identifier used to identify module names that can't be
shadowed.
```ts
const MODULE_NAME: typeof MODULE_NAME
```

### `MODULE_SELF`
Special symbol identifier used to link a module's environment back to the
module object itself
```ts
const MODULE_SELF: typeof MODULE_SELF
```

### `LOCATION_TAG`
Brand symbol stamped on arrays that are Locations, so they can be told
apart from plain number pairs.
```ts
const LOCATION_TAG: typeof LOCATION_TAG
```

## plugin

### `default`
[ESBuild](https://esbuild.github.io) or [Bun](https://bun.com) plugin that
loads `.bk` files as their Backolon AST.
```ts
const default: BunPlugin
```
