# Functions

## parser

### `describeCombinator`
Renders a combinator in a compact PEG-like notation, via its operation's `describe` in opDefs; for debugging grammars.
```ts
describeCombinator(node: GrammarCombinator): string
```
**Parameters:**
- `node: GrammarCombinator`
**Returns:** `string`

### `hashCombinator`
A hash of a combinator tree, driven by the `hashFields` of each
operation's definition: like trees hash alike. Without a resolver this is
a purely structural hash and is cached on the node itself, so hashing a
tree costs one walk, ever. With a resolver (used by the parser to tell
parameterized rule instances apart), reference nodes contribute the hash
of what they resolve to in the current scopes instead of their own shape,
and nothing is cached -- the result depends on the scopes, not just the
tree.
```ts
hashCombinator(g: GrammarCombinator, resolve?: ReferenceResolver): number
```
**Parameters:**
- `g: GrammarCombinator`
- `resolve: ReferenceResolver` (optional)
**Returns:** `number`

### `hashResolved`
A hash of a combinator tree with its parameter references resolved:
`param` nodes contribute the hash of the argument they name (resolved in
the lexical scope), `ambient` nodes the hash of the dynamic binding they
name (resolved in the dynamic scope captured by that binding, so a
binding's value never depends on itself), and `bind` nodes hash their
body under the dynamic scope the bind creates. An unbound reference with
a default contributes the default's hash. This is the one hash function,
hashCombinator, driven by a resolver; nothing is cached, since
the result depends on the scopes, not just the tree.
```ts
hashResolved(g: GrammarCombinator, locals: Locals, dynamics: Dynamics, path: string): number
```
**Parameters:**
- `g: GrammarCombinator`
- `locals: Locals`
- `dynamics: Dynamics`
- `path: string`
**Returns:** `number`

### `lit`
Matches the literal string `p` exactly; produces a leaf holding that text.
```ts
lit(s: string): CombinatorBase & { op: "literal" } & { pattern: string | [string, string] }
```
**Parameters:**
- `s: string`
**Returns:** `CombinatorBase & { op: "literal" } & { pattern: string | [string, string] }`

### `regex`
Matches the regex `p` anchored at the current position (the engine adds the sticky flag); produces a leaf holding the matched text. The pattern is stored as `[source, flags]` to keep combinators plain data.
```ts
regex(p: RegExp): CombinatorBase & { op: "literal" } & { pattern: string | [string, string] }
```
**Parameters:**
- `p: RegExp`
**Returns:** `CombinatorBase & { op: "literal" } & { pattern: string | [string, string] }`

### `seq`
Matches all of `n` in order; the result is a flat node holding every child's result.
```ts
seq(n: GrammarCombinator[]): CombinatorBase & { op: "sequence" } & { items: GrammarCombinator[]; separator: GrammarCombinator | undefined }
```
**Parameters:**
- `n: GrammarCombinator[]`
**Returns:** `CombinatorBase & { op: "sequence" } & { items: GrammarCombinator[]; separator: GrammarCombinator | undefined }`

### `ssep`
Like `seq`, but the separator `s` is attempted before, between, and after the items; separator results are marked ignored.
```ts
ssep(s: GrammarCombinator, n: GrammarCombinator[]): CombinatorBase & { op: "sequence" } & { items: GrammarCombinator[]; separator: GrammarCombinator | undefined }
```
**Parameters:**
- `s: GrammarCombinator`
- `n: GrammarCombinator[]`
**Returns:** `CombinatorBase & { op: "sequence" } & { items: GrammarCombinator[]; separator: GrammarCombinator | undefined }`

### `alt`
Tries every alternative and returns the first alternative that cut (whether or not it succeeded) or if none cut, the longest succeeding match (the first, on ties).
```ts
alt(n: GrammarCombinator[]): CombinatorBase & { op: "alternatives" } & { options: GrammarCombinator[]; first?: boolean }
```
**Parameters:**
- `n: GrammarCombinator[]`
**Returns:** `CombinatorBase & { op: "alternatives" } & { options: GrammarCombinator[]; first?: boolean }`

### `altFirst`
Ordered choice: returns the first succeeding alternative, without trying later ones (a later alternative is tried only if every earlier one fails without cutting).
```ts
altFirst(n: GrammarCombinator[]): CombinatorBase & { op: "alternatives" } & { options: GrammarCombinator[]; first?: boolean }
```
**Parameters:**
- `n: GrammarCombinator[]`
**Returns:** `CombinatorBase & { op: "alternatives" } & { options: GrammarCombinator[]; first?: boolean }`

### `parseToCST`
Parse text into a CST. The CST may contain error nodes if there were syntax errors.
```ts
parseToCST(text: string, startIndex: number, startRule: string, grammar: Grammar, recoverNodeType: string, errorType: string, memo: Memo): CSTNode
```
**Parameters:**
- `text: string`
- `startIndex: number`
- `startRule: string`
- `grammar: Grammar`
- `recoverNodeType: string`
- `errorType: string` — default: `"BAD"`
- `memo: Memo` — default: `{}`
**Returns:** `CSTNode`

### `stripInlinedFunctions`
Deep-copies a value into a printable form for debugging, replacing JEB
runtime values that cannot be displayed: functions become "__name"
strings, and location-wrapped forms are unwrapped to their payload.
```ts
stripInlinedFunctions<T>(ast: T): T
```
**Parameters:**
- `ast: T`
**Returns:** `T`

### `describe`
Renders a combinator in a compact PEG-like notation, for debugging grammars. Each operation's rendering lives in its definition in the op table (`opDefs`).
```ts
describe(g: GrammarCombinator): string
```
**Parameters:**
- `g: GrammarCombinator`
**Returns:** `string`
