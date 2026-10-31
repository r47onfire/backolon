# Variables & Constants

## parser

### `opDefs`
The definition of every grammar operation, keyed by its `op`.
```ts
const opDefs: { literal: { create: (pattern: string | [string, string]) => { pattern: string | [string, string] }; call: any; hashFields: ["pattern", Text][]; describe: (__namedParameters: { pattern: string | [string, string] }) => string }; keyword: { create: (t: string, options: string[]) => { tag: string; options: string[] }; call: any; hashFields: (["tag", Tag] | ["options", StringArray])[]; describe: (__namedParameters: { tag: string; options: string[] }) => string }; opsym: { create: (t: string, op: string) => { tag: string; sym: string }; call: any; hashFields: (["tag", Tag] | ["sym", String])[]; describe: (__namedParameters: { tag: string; sym: string }) => string }; ignored: { create: (n: GrammarCombinator) => { child: GrammarCombinator }; call: any; hashFields: ["child", Child][]; describe: (__namedParameters: { child: GrammarCombinator }) => string }; rule: { create: (r: string, args: GrammarCombinator[]) => { name: string; args: GrammarCombinator[] }; call: any; hashFields: (["name", String] | ["args", Children])[]; describe: (__namedParameters: { name: string; args: GrammarCombinator[] }) => string }; param: { create: (p: string, defaultValue?: GrammarCombinator) => { name: string; default: GrammarCombinator | undefined }; call: any; hashFields: (["name", String] | ["default", Child])[]; describe: (__namedParameters: { name: string; default: GrammarCombinator | undefined }) => string }; ambient: { create: (p: string, defaultValue?: GrammarCombinator) => { name: string; default: GrammarCombinator | undefined }; call: any; hashFields: (["name", String] | ["default", Child])[]; describe: (__namedParameters: { name: string; default: GrammarCombinator | undefined }) => string }; bind: { create: (p: string, extend: boolean, value: GrammarCombinator, body: GrammarCombinator) => { name: string; value: GrammarCombinator; extend: boolean; body: GrammarCombinator }; call: any; hashFields: (["name", String] | ["value", ScopedChild] | ["extend", Boolean] | ["body", Child])[]; describe: (__namedParameters: { name: string; value: GrammarCombinator; extend: boolean; body: GrammarCombinator }) => string }; sequence: { create: (s: GrammarCombinator | undefined, n: GrammarCombinator[]) => { items: GrammarCombinator[]; separator: GrammarCombinator | undefined }; call: any; hashFields: (["items", Children] | ["separator", AuxChild])[]; describe: (__namedParameters: { items: GrammarCombinator[]; separator: GrammarCombinator | undefined }) => string }; alternatives: { create: (first: boolean, n: GrammarCombinator[]) => { options: GrammarCombinator[]; first: boolean }; call: any; hashFields: (["options", Children] | ["first", Boolean])[]; describe: (__namedParameters: { options: GrammarCombinator[]; first?: boolean }) => string }; optional: { create: (n: GrammarCombinator) => { child: GrammarCombinator }; call: any; hashFields: ["child", Child][]; describe: (__namedParameters: { child: GrammarCombinator }) => string }; repeat: { create: (r: boolean, n: GrammarCombinator) => { items: GrammarCombinator[]; required: boolean }; call: any; hashFields: (["items", Children] | ["required", Boolean])[]; describe: (__namedParameters: { items: GrammarCombinator[]; required: boolean }) => string }; joined: { create: (j: GrammarCombinator, n: GrammarCombinator, r2: boolean, t: boolean) => { joiner: GrammarCombinator; element: GrammarCombinator; require2: boolean; trailing: boolean }; call: any; hashFields: (["element", Child] | ["joiner", AuxChild] | ["require2", Boolean] | ["trailing", Boolean])[]; describe: (__namedParameters: { joiner: GrammarCombinator; element: GrammarCombinator; require2: boolean; trailing: boolean }) => string }; if: { create: (c: GrammarCombinator, t: GrammarCombinator, f: GrammarCombinator) => { condition: GrammarCombinator; ifTrue: GrammarCombinator; ifFalse: GrammarCombinator }; call: (ctx: OpContext, __namedParameters: { condition: GrammarCombinator; ifTrue: GrammarCombinator; ifFalse: GrammarCombinator }, path: string, i: number, locals: Locals, dynamics: Dynamics) => MatchFail | Readonly<{ type?: string; ignored?: boolean; tag?: string; text?: string; start: number; end: number; children?: readonly (Readonly<{ type?: string | undefined; ignored?: boolean | undefined; tag?: string | undefined; text?: string | undefined; start: number; end: number; children?: readonly Readonly<...>[] | undefined; errorExpected?: GrammarCombinator | undefined; }>)[]; errorExpected?: GrammarCombinator }>; hashFields: (["condition", AuxChild] | ["ifTrue", Child] | ["ifFalse", Child])[]; describe: (__namedParameters: { condition: GrammarCombinator; ifTrue: GrammarCombinator; ifFalse: GrammarCombinator }) => string }; tag: { create: (t: string, n: GrammarCombinator) => { tag: string; child: GrammarCombinator }; call: any; hashFields: (["tag", Tag] | ["child", Child])[]; describe: (__namedParameters: { tag: string; child: GrammarCombinator }) => string }; cut: { create: (d: any) => { depth: any }; call: any; hashFields: ["depth", Number][]; describe: (__namedParameters: { depth: number }) => string }; lookahead: { create: (p: boolean, n: GrammarCombinator) => { positive: boolean; child: GrammarCombinator }; call: any; hashFields: (["child", Child] | ["positive", Boolean])[]; describe: (__namedParameters: { positive: boolean; child: GrammarCombinator }) => string }; nonempty: { create: (n: GrammarCombinator) => { child: GrammarCombinator }; call: any; hashFields: ["child", Child][]; describe: (__namedParameters: { child: GrammarCombinator }) => string }; sameline: { create: (n: GrammarCombinator) => { child: GrammarCombinator }; call: any; hashFields: ["child", Child][]; describe: (__namedParameters: { child: GrammarCombinator }) => string }; nothing: { create: () => void; call: (_: OpContext, __: void, ___: string, i: number) => { start: number; end: number }; hashFields: never[]; describe: () => string }; try: { create: (n: GrammarCombinator) => { child: GrammarCombinator }; call: any; hashFields: ["child", Child][]; describe: (__namedParameters: { child: GrammarCombinator }) => string }; die: { create: (m: string) => { message: string }; call: (_: OpContext, node: { message: string }, __: string, i: number) => MatchFail; hashFields: ["message", String][]; describe: (__namedParameters: { message: string }) => string } }
```

### `kw`
Matches any one of the given options between regex \b separators; the result is tagged `t` and ignored.
```ts
const kw: (args: [t: string, ...options: string[]]) => CombinatorBase & { op: "keyword" } & { tag: string; options: string[] }
```

### `op`
Matches this operator, but also asserts that it doesn't also simultaneously match any other longer operator defined elsewhere in the grammar.
```ts
const op: (args: [t: string, op: string]) => CombinatorBase & { op: "opsym" } & { tag: string; sym: string }
```

### `ignored`
Parses `n` but flags the result `ignored`: its text stays in the CST (so concatenating all leaves still reproduces the source) and it is dropped later, when the CST is lowered to an AST.
```ts
const ignored: (args: [n: GrammarCombinator]) => CombinatorBase & { op: "ignored" } & { child: GrammarCombinator }
```

### `rule`
Invokes the named rule `r` from the grammar; the result is wrapped in a node typed `r`, unless the rule only delegated to another named rule. Extra combinators are arguments, for calling a parameterized rule.
```ts
const rule: (args: [r: string, ...args: GrammarCombinator[]]) => CombinatorBase & { op: "rule" } & { name: string; args: GrammarCombinator[] }
```

### `param`
Evaluates the argument combinator bound to the parameter `p` of the enclosing parameterized rule, in the scope where that argument was written. If `p` is unbound and a `defaultValue` is given, the default is evaluated instead, in the scope in effect at this reference; with no default, an unbound parameter is an error.
```ts
const param: (args: [p: string, defaultValue?: GrammarCombinator]) => CombinatorBase & { op: "param" } & { name: string; default: GrammarCombinator | undefined }
```

### `ambient`
Evaluates the combinator bound to the dynamic parameter `p` by the nearest enclosing bind. Dynamic parameters are ambient context: any rule parsed within the bind's extent can read them without receiving them as arguments. If `p` is unbound and a `defaultValue` is given, the default is evaluated instead, in the scope in effect at this reference; with no default, an unbound dynamic parameter is an error.
```ts
const ambient: (args: [p: string, defaultValue?: GrammarCombinator]) => CombinatorBase & { op: "ambient" } & { name: string; default: GrammarCombinator | undefined }
```

### `bind`
Parses `body` with the dynamic parameter `p` bound to `value` for the body's dynamic extent (including any rules it calls, however deep). Inside `value`, `ambient(p)` still refers to the binding this one shadows, so a new value can extend the old one.
```ts
const bind: (args: [p: string, extend: boolean, value: GrammarCombinator, body: GrammarCombinator]) => CombinatorBase & { op: "bind" } & { name: string; value: GrammarCombinator; extend: boolean; body: GrammarCombinator }
```

### `opt`
Matches `n` if it succeeds, otherwise succeeds empty -- unless `n` failed after a cut, in which case the failure propagates.
```ts
const opt: (args: [n: GrammarCombinator]) => CombinatorBase & { op: "optional" } & { child: GrammarCombinator }
```

### `rep`
Repeats `n` greedily until it fails ordinarily; `r` = true requires at least one match, false allows zero. With several nodes the repetition cycles through them.
```ts
const rep: (args: [r: boolean, n: GrammarCombinator]) => CombinatorBase & { op: "repeat" } & { items: GrammarCombinator[]; required: boolean }
```

### `joined`
Matches `n` separated by `j` (`n`, `n` `j` `n`, ...), keeping elements and separators in one flat result. `r2` requires at least two elements; `t` permits a trailing separator.
```ts
const joined: (args: [j: GrammarCombinator, n: GrammarCombinator, r2: boolean, t: boolean]) => CombinatorBase & { op: "joined" } & { joiner: GrammarCombinator; element: GrammarCombinator; require2: boolean; trailing: boolean }
```

### `if_`
Conditional: evaluates `c` as a lookahead (consuming no input); matches `t` if it succeeds, `f` otherwise.
```ts
const if_: (args: [c: GrammarCombinator, t: GrammarCombinator, f: GrammarCombinator]) => CombinatorBase & { op: "if" } & { condition: GrammarCombinator; ifTrue: GrammarCombinator; ifFalse: GrammarCombinator }
```

### `tag`
Parses `n` and tags the result with `t` (the visual kind used for syntax highlighting).
```ts
const tag: (args: [t: string, n: GrammarCombinator]) => CombinatorBase & { op: "tag" } & { tag: string; child: GrammarCombinator }
```

### `cut`
Cut: once matched, a later failure no longer falls back to sibling alternatives; `d` is how many enclosing choice levels the commitment spans. Produces an empty ignored node.
```ts
const cut: (args: [d: any]) => CombinatorBase & { op: "cut" } & { depth: number }
```

### `lookahead`
Asserts that `n` matches (`p` = true) or does not match (`p` = false) at the current position, consuming no input.
```ts
const lookahead: (args: [p: boolean, n: GrammarCombinator]) => CombinatorBase & { op: "lookahead" } & { positive: boolean; child: GrammarCombinator }
```

### `nonempty`
Parses `n` and fails if it matched without consuming any input.
```ts
const nonempty: (args: [n: GrammarCombinator]) => CombinatorBase & { op: "nonempty" } & { child: GrammarCombinator }
```

### `sameline`
Parses `n` and fails if the matched span contains a newline.
```ts
const sameline: (args: [n: GrammarCombinator]) => CombinatorBase & { op: "sameline" } & { child: GrammarCombinator }
```

### `nothing`
Always matches, consuming no input.
```ts
const nothing: (args: []) => CombinatorBase & { op: "nothing" } & void
```

### `yes`
Always matches, consuming no input.
```ts
const yes: (args: []) => CombinatorBase & { op: "nothing" } & void
```

### `try_`
Parses `n` speculatively: if `n` fails, any cut inside it is hidden, so the failure looks ordinary and enclosing alternatives can still fall back.
```ts
const try_: (args: [n: GrammarCombinator]) => CombinatorBase & { op: "try" } & { child: GrammarCombinator }
```

### `die`
Always fails, with `m` naming what was expected. The failure carries an infinite cut, so no alternative or recovery is attempted past it.
```ts
const die: (args: [m: string]) => CombinatorBase & { op: "die" } & { message: string }
```

### `backolonGrammar`
The Backolon grammar, as plain combinator data.

The expression rules form a precedence chain from loosest to tightest:

* expr
* pipe
* implicit_call
* kw_arg
* assign_rev
* assignment
* ternary
* logical
* comparison
* containment
* bitwise
* bitshift
* sum
* term
* factor
* indexing
* primary

Binary levels are written left-recursively (the parser grows the
recursion), and after matching an operator each level first checks a
negative lookahead on `assign_op` -- so `a += b` is not misread as a binary
`+` followed by a prefix `=` assignment -- and then cuts to commit the level.
```ts
const backolonGrammar: Grammar
```

### `all_tags`
Every highlight tag name used anywhere in backolonGrammar, collected by walking all of its combinator trees (e.g. for building a syntax-highlight theme).
```ts
const all_tags: Set<any>
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
