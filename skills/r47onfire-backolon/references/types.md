# Types & Enums

## parser

### `Grammar`
A grammar: rule names mapped to their definitions.
```ts
Readonly<Record<string, GrammarCombinator | ParameterizedRule>>
```

### `ParameterizedRule`
A parameterized rule definition: the parameter names, and the rule body.
Inside the body, `param(name)` evaluates the combinator that was passed
for that parameter at the call site (in the call site's scope).
```ts
readonly [params: readonly string[], body: GrammarCombinator]
```

### `OpNodeShapes`
The fields of every operation's node, one entry per operation. This is
the single source the rest of the combinator types are derived from:
GrammarOp is its keys, GrammarCombinator is the union of
its shapes (plus the common base), and the `opDefs` table is checked
against it -- a `create` that returns anything else, or a `hashFields`
entry naming a field that does not exist, is (or at least should be) a
type error.
**Properties:**
- `literal: { pattern: string | [string, string] }`
- `keyword: { tag: string; options: string[] }`
- `opsym: { tag: string; sym: string }`
- `ignored: { child: GrammarCombinator }`
- `rule: { name: string; args: GrammarCombinator[] }`
- `param: { name: string; default: GrammarCombinator | undefined }`
- `ambient: { name: string; default: GrammarCombinator | undefined }`
- `bind: { name: string; value: GrammarCombinator; extend: boolean; body: GrammarCombinator }`
- `sequence: { items: GrammarCombinator[]; separator: GrammarCombinator | undefined }`
- `alternatives: { options: GrammarCombinator[]; first?: boolean }`
- `optional: { child: GrammarCombinator }`
- `repeat: { items: GrammarCombinator[]; required: boolean }`
- `joined: { joiner: GrammarCombinator; element: GrammarCombinator; require2: boolean; trailing: boolean }`
- `if: { condition: GrammarCombinator; ifTrue: GrammarCombinator; ifFalse: GrammarCombinator }`
- `tag: { tag: string; child: GrammarCombinator }`
- `cut: { depth: number }`
- `lookahead: { positive: boolean; child: GrammarCombinator }`
- `nonempty: { child: GrammarCombinator }`
- `sameline: { child: GrammarCombinator }`
- `nothing: void`
- `try: { child: GrammarCombinator }`
- `die: { message: string }`

### `GrammarOp`
The operation a GrammarCombinator performs; determines which of
the per-operation subtypes a node is, and so which named fields it has.
```ts
keyof OpNodeShapes
```

### `GrammarCombinator`
A single grammar node. Combinators are plain serializable data (no
functions), so grammars can be built, inspected, and patched as values.
Each operation has its own subtype with explicitly named fields; the
per-operation definitions (how a node is created, parsed, hashed, and
rendered) live together in the `opDefs` table below.
```ts
{ [O in GrammarOp]: CombinatorBase & { op: O } & OpNodeShapes[O] }[GrammarOp]
```

### `ParamBinding`
One argument binding of a parameterized rule invocation: the argument
combinator, plus the parameter scope in effect where the argument was
written, so that evaluating it later (via the `param` op) resolves any
parameters it mentions in the call site's scope, not the callee's.
**Properties:**
- `node: GrammarCombinator`
- `locals: Locals`

### `ParamFrame`
A parameter scope: the bindings of one parameterized rule invocation,
chained to the enclosing scope. Scopes are threaded through the parse as
immutable values, so speculative branches (alternatives, lookaheads,
recovery probes) can never disturb each other's bindings.
**Properties:**
- `bindings: Readonly<Record<string, ParamBinding>>`
- `next: Locals`

### `Locals`
```ts
ParamFrame | undefined
```

### `DynBindingFrame`
The dynamic scope: a chain of dynamic bindings (bound value, scopes in which
it was created), innermost first. Like the lexical scope it is threaded through
the parse as an immutable value, so speculative branches cannot disturb each
other's bindings. `key` identifies this exact chain; while a chain is in effect
its key is part of every memo identity, so a result that depends on ambient
context is never reused under a different context.
**Properties:**
- `name: string`
- `node: GrammarCombinator`
- `locals: Locals`
- `dynamics: Dynamics`
- `next: Dynamics`
- `key: string`

### `Dynamics`
```ts
DynBindingFrame | undefined
```

### `OpContext`
The services an operation's `call` needs from the parser: the input, the
grammar, the memoizing entry point for sub-parses, error recovery, and
the cut bookkeeping. Provided by `parseToCST`; see there for what each
one does.
**Properties:**
- `text: string`
- `memo: Memo`
- `grammar: Grammar`

### `GrammarOpDef`
The definition of one grammar operation: how its nodes are created
(`create`, also exported as the operation's factory function), how they
are parsed (`call`), which of their fields feed the combinator hash
(`hashFields`), and how they are rendered for debugging (`describe`).
Keeping all four together in this table is what lets the parser's
dispatcher, the hash function, and the debug renderer stay generic
over operations. This is the loose common shape of a definition; each
entry in opDefs is more precise (its `call` and `describe` are
typed against the exact node shape its own `create` returns).
**Properties:**
- `create: (args: any[]) => N`
- `call: (ctx: OpContext, node: N, path: string, i: number, locals: Locals, dynamics: Dynamics) => MatchFail | Readonly<{ type?: string; ignored?: boolean; tag?: string; text?: string; start: number; end: number; children?: readonly (Readonly<{ type?: string | undefined; ignored?: boolean | undefined; tag?: string | undefined; text?: string | undefined; start: number; end: number; children?: readonly Readonly<...>[] | undefined; errorExpected?: GrammarCombinator | undefined; }>)[]; errorExpected?: GrammarCombinator }>`
- `hashFields: readonly (readonly [keyof N, MixAction])[]`
- `describe: (node: N) => string`

### `OpDefs`
The (weak) type of opDefs: every operation's definition, tied to its declared node shape in OpNodeShapes.
```ts
{ [O in GrammarOp]: GrammarOpDef<OpNodeShapes[O]> }
```

### `CompilerTable`
Hooks matching the rule name to handler type. T should be at minimum a JEB callable
(which can be a Javascript function already). The mapping is used by the handler for
any purpose, but is usually used to map variant to implementation (e.g "+" to B_plus
and "-" to B_minus.)
```ts
Record<string, [fn: T, mapping?: Record<string, any>]>
```

### `CompileBuilder`
Result from a single compile step. If any value in `tbc` is true, the corresponding template
value will be expected to be CSTNodes, and they will be compiled before returning.
If `post` is set then the result, after assembling, will be passed back into the `post` entry
in the table (as a single node)
**Properties:**
- `val: any`
- `tbc: [Readonly<{ type?: string; ignored?: boolean; tag?: string; text?: string; start: number; end: number; children?: readonly (Readonly<{ type?: string | undefined; ignored?: boolean | undefined; tag?: string | undefined; text?: string | undefined; start: number; end: number; children?: readonly Readonly<...>[] | undefined; errorExpected?: GrammarCombinator | undefined; }>)[]; errorExpected?: GrammarCombinator }>, PropertyKey[]][]` (optional)
- `post: string | null` (optional)

### `CSTNode`
A node of the concrete syntax tree produced by the parser.

Invariant: recursively concatenating the `text` of all leaves -- including
`ignored` nodes -- reproduces the original source exactly. Ignored nodes are
only removed in a later pass, when the CST is lowered to an AST.
```ts
Readonly<{ type?: string; ignored?: boolean; tag?: string; text?: string; start: number; end: number; children?: readonly CSTNode[]; errorExpected?: GrammarCombinator }>
```

### `MemoLoc`
Memoization key: `&lt;start index&gt;#&lt;grammar path&gt;`. The path of a nested
combinator is built from rule names plus `/`-separated child indices, so
the same combinator reached through different rules memoizes separately.
```ts
`${number}#${string}`
```

### `Memo`
The memo table for a parse: results (a CST node, a failure, or an
in-progress LR) by `MemoLoc`. A caller may pass one in to reuse it across
parses, but it must be cleared whenever the grammar changes.
```ts
Record<MemoLoc, CSTNode | MatchFail | LR>
```

### `CombinatorWalker`
**Properties:**
- `precomputed: (node: GrammarCombinator, env: E) => T | undefined` (optional) — A finished value for this node, if already known: cancels the walk below it.
- `memoize: (node: GrammarCombinator, value: T, env: E) => void` (optional) — Record a node's folded value for future `precomputed` hits.

### `Head`
Warth-style left-recursion state for one input position: `path` is the rule
whose seed is being grown, `involved` is the set of rules that participated
in the recursive cycle, and `eval` is the subset still to re-evaluate in
the current growth pass.
**Properties:**
- `path: string`
- `involved: Set<string>`
- `eval: Set<string>`

### `LR`
One in-progress invocation on the left-recursion stack (a linked list via
`next`). `seed` starts as a failure and is replaced by successively longer
matches while the left recursion grows; `head` is set once this invocation
turns out to be part of a recursive cycle.
**Properties:**
- `path: string`
- `seed: MatchFail | Readonly<{ type?: string; ignored?: boolean; tag?: string; text?: string; start: number; end: number; children?: readonly Readonly<({ type?: string | undefined; ignored?: boolean | undefined; tag?: string | undefined; text?: string | undefined; start: number; end: number; children?: readonly Readonly<...>[] | undefined; errorExpected?: GrammarCombinator | undefined; })>[]; errorExpected?: GrammarCombinator }>`
- `head: Head | undefined`
- `next: LR | undefined`

### `MixAction`
How one field of a combinator is mixed into its hash (see `hashFields` on GrammarOpDef).
- `String` = `0` — a string, hashed with javaHash
- `Tag` = `1` — same as String but semantically a tag
- `Number` = `2` — a number, mixed as-is
- `Boolean` = `3` — a boolean, mixed as 1 or 0
- `Text` = `4` — a string or an array of strings (each hashed with javaHash)
- `StringArray` = `5` — an array of strings (each hashed with javaHash)
- `Child` = `6` — a single sub-combinator, hashed recursively
- `ScopedChild` = `7` — a single sub-combinator, hashed recursively, which changes the scope available to its children
- `Children` = `8` — an array of sub-combinators, each hashed recursively
- `AuxChild` = `9` — a single sub-combinator in the auxiliary role (separator, joiner, condition),
hashed recursively with a different constant so it cannot be confused with a
sequential child

## runtime

### `JSModule`
Interface for what a Javascript module needs to comply with
to be able to be imported.

### `JSONModule`
Interface for a JSON module object
**Properties:**
- `code: any[]`
- `files: string[]`
- `sourceMap: string` (optional)

### `JSONSourceMap`
Not a sourcemap-V3 since the mappings don't
have any concept of "compiled line/pos".
**Properties:**
- `contents: string[]`
- `mappings: [start: number, end: number][][]`

### `BackolonVMState`
The part of BackolonVM state captured by JEB's state
snapshot/rollback mechanism. Module loading state is represented as
each cached module's `parent` link (see Module.parent);
restoring it makes half-loaded modules look unloaded again.
**Properties:**
- `moduleLoad: (Module | null)[]`
- `parser: any`
- `resetParser: boolean`

### `ModuleCacheEntry`
Everything the VM tracks about one registered module.
**Properties:**
- `mod: Module`
- `src: SourceTracker | undefined` — The module's source, once a loader has provided it.
- `map: Span[]` — Source spans registered for this module; a span's index in this array is part of its Location.
