# Variables & Constants

## parser

### `opDefs`
The definition of every grammar operation, keyed by its `op`.
```ts
const opDefs: OpDefs
```

### `kw`
Matches any one of the given options between regex \b separators; the result is tagged `t` and ignored.
```ts
const kw: (args: any[]) => CombinatorBase & { op: "keyword" } & { tag: string; options: string[] }
```

### `ignored`
Parses `n` but flags the result `ignored`: its text stays in the CST (so concatenating all leaves still reproduces the source) and it is dropped later, when the CST is lowered to an AST.
```ts
const ignored: (args: any[]) => CombinatorBase & { op: "ignored" } & { child: GrammarCombinator }
```

### `rule`
Invokes the named rule `r` from the grammar; the result is wrapped in a node typed `r`, unless the rule only delegated to another named rule. Extra combinators are arguments, for calling a parameterized rule.
```ts
const rule: (args: any[]) => CombinatorBase & { op: "rule" } & { name: string; args: GrammarCombinator[] }
```

### `param`
Evaluates the argument combinator bound to the parameter `p` of the enclosing parameterized rule, in the scope where that argument was written. If `p` is unbound and a `defaultValue` is given, the default is evaluated instead, in the scope in effect at this reference; with no default, an unbound parameter is an error.
```ts
const param: (args: any[]) => CombinatorBase & { op: "param" } & { name: string; default: GrammarCombinator | undefined }
```

### `ambient`
Evaluates the combinator bound to the dynamic parameter `p` by the nearest enclosing bind. Dynamic parameters are ambient context: any rule parsed within the bind's extent can read them without receiving them as arguments. If `p` is unbound and a `defaultValue` is given, the default is evaluated instead, in the scope in effect at this reference; with no default, an unbound dynamic parameter is an error.
```ts
const ambient: (args: any[]) => CombinatorBase & { op: "ambient" } & { name: string; default: GrammarCombinator | undefined }
```

### `bind`
Parses `body` with the dynamic parameter `p` bound to `value` for the body's dynamic extent (including any rules it calls, however deep). Inside `value`, `ambient(p)` still refers to the binding this one shadows, so a new value can extend the old one.
```ts
const bind: (args: any[]) => CombinatorBase & { op: "bind" } & { name: string; value: GrammarCombinator; body: GrammarCombinator }
```

### `opt`
Matches `n` if it succeeds, otherwise succeeds empty -- unless `n` failed after a cut, in which case the failure propagates.
```ts
const opt: (args: any[]) => CombinatorBase & { op: "optional" } & { child: GrammarCombinator }
```

### `rep`
Repeats `n` greedily until it fails ordinarily; `r` = true requires at least one match, false allows zero. With several nodes the repetition cycles through them.
```ts
const rep: (args: any[]) => CombinatorBase & { op: "repeat" } & { items: GrammarCombinator[]; required: boolean }
```

### `joined`
Matches `n` separated by `j` (`n`, `n` j `n`, ...), keeping elements and separators in one flat result. `r2` requires at least two elements; `t` permits a trailing separator.
```ts
const joined: (args: any[]) => CombinatorBase & { op: "joined" } & { joiner: GrammarCombinator; element: GrammarCombinator; require2: boolean; trailing: boolean }
```

### `if_`
Conditional: evaluates `c` as a lookahead (consuming no input); matches `t` if it succeeds, `f` otherwise.
```ts
const if_: (args: any[]) => CombinatorBase & { op: "if" } & { condition: GrammarCombinator; ifTrue: GrammarCombinator; ifFalse: GrammarCombinator }
```

### `tag`
Parses `n` and tags the result with `t` (the visual kind used for syntax highlighting).
```ts
const tag: (args: any[]) => CombinatorBase & { op: "tag" } & { tag: string; child: GrammarCombinator }
```

### `cut`
Cut: once matched, a later failure no longer falls back to sibling alternatives; `d` is how many enclosing choice levels the commitment spans. Produces an empty ignored node.
```ts
const cut: (args: any[]) => CombinatorBase & { op: "cut" } & { depth: number }
```

### `lookahead`
Asserts that `n` matches (`p` = true) or does not match (`p` = false) at the current position, consuming no input.
```ts
const lookahead: (args: any[]) => CombinatorBase & { op: "lookahead" } & { positive: boolean; child: GrammarCombinator }
```

### `nonempty`
Parses `n` and fails if it matched without consuming any input.
```ts
const nonempty: (args: any[]) => CombinatorBase & { op: "nonempty" } & { child: GrammarCombinator }
```

### `sameline`
Parses `n` and fails if the matched span contains a newline.
```ts
const sameline: (args: any[]) => CombinatorBase & { op: "sameline" } & { child: GrammarCombinator }
```

### `eps`
Always matches, consuming no input.
```ts
const eps: (args: any[]) => CombinatorBase & { op: "nothing" } & Record<never, never>
```

### `try_`
Parses `n` speculatively: if `n` fails, any cut inside it is hidden, so the failure looks ordinary and enclosing alternatives can still fall back.
```ts
const try_: (args: any[]) => CombinatorBase & { op: "try" } & { child: GrammarCombinator }
```

### `die`
Always fails, with `m` naming what was expected. The failure carries an infinite cut, so no alternative or recovery is attempted past it.
```ts
const die: (args: any[]) => CombinatorBase & { op: "die" } & { message: string }
```

### `backolonGrammar`
The Backolon grammar, as plain combinator data.

The expression rules form a precedence chain from loosest to tightest:
expr -&gt; pipe -&gt; implicit_call -&gt; kw_arg -&gt; assignment -&gt; ternary -&gt; logical -&gt;
comparison -&gt; bitwise -&gt; bitshift -&gt; sum -&gt; term -&gt; factor -&gt; indexing -&gt;
primary. Binary levels are written left-recursively (the parser grows the
recursion), and after matching an operator each level first checks a
negative lookahead on `assign_op` -- so `a += b` is not misread as a binary
`+` followed by a prefix `=` assignment -- and then cuts to commit the level.
```ts
const backolonGrammar: Grammar
```

### `all_tags`
Every highlight tag name used anywhere in backolonGrammar, collected by walking all of its combinator trees (e.g. for building a syntax-highlight theme).
```ts
const all_tags: Set<string>
```

## runtime

### `OP_do_import`
The `import` opcode: pops an absolute URL off the data stack and loads
that module (running it as the main module if `asMain` is set). The
load is asynchronous, so the VM is suspended until it completes.
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
Brand symbol stamped on arrays that are Locations, so they can be told apart from plain number pairs.
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
