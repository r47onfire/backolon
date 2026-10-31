# Functions

## parser

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
Like `seq`, but the separator `s` is attempted between the items; separator results are marked ignored.
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

### `no`
Always fails, but not a hard failure.
```ts
no(): CombinatorBase & { op: "alternatives" } & { options: GrammarCombinator[]; first?: boolean }
```
**Returns:** `CombinatorBase & { op: "alternatives" } & { options: GrammarCombinator[]; first?: boolean }`

### `altFirst`
Ordered choice: returns the first succeeding alternative, without trying later ones (a later alternative is tried only if every earlier one fails without cutting).
```ts
altFirst(n: GrammarCombinator[]): CombinatorBase & { op: "alternatives" } & { options: GrammarCombinator[]; first?: boolean }
```
**Parameters:**
- `n: GrammarCombinator[]`
**Returns:** `CombinatorBase & { op: "alternatives" } & { options: GrammarCombinator[]; first?: boolean }`

### `describeCombinator`
Renders a combinator in a compact PEG-like notation, via its operation's `describe` in opDefs; for debugging grammars.
```ts
describeCombinator(node: GrammarCombinator): string
```
**Parameters:**
- `node: GrammarCombinator`
**Returns:** `string`

### `condenseCST`
Condense a CST as much as possible, preserving metadata spans:

* ignored children are removed
* unnamed container nodes are merged into their parent
* named nodes, text leaves, and error nodes stay as they are

The root is always a named node since a parse always starts at a named rule.
```ts
condenseCST(cst: CSTNode): CSTNode
```
**Parameters:**
- `cst: CSTNode`
**Returns:** `CSTNode`

### `syncCompile`
```ts
syncCompile(node: CSTNode, tab: CompilerTable<(items: any, table?: Record<string, any>) => CompileBuilder>, wrap: (compiled: any, node: CSTNode) => any, handleError: (message: any) => any): any
```
**Parameters:**
- `node: CSTNode`
- `tab: CompilerTable<(items: any, table?: Record<string, any>) => CompileBuilder>`
- `wrap: (compiled: any, node: CSTNode) => any`
- `handleError: (message: any) => any`
**Returns:** `any`

### `assignPath`
```ts
assignPath<T>(val: T, obj: any, path: PropertyKey[]): T
```
**Parameters:**
- `val: T`
- `obj: any`
- `path: PropertyKey[]`
**Returns:** `T`

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

### `walkCombinator`
```ts
walkCombinator<T, E>(g: GrammarCombinator, env: E, walker: CombinatorWalker<T, E>): T
```
**Parameters:**
- `g: GrammarCombinator`
- `env: E`
- `walker: CombinatorWalker<T, E>`
**Returns:** `T`

### `hashCombinator`
A hash of a combinator tree, driven by the `hashFields` of each
operation's definition: like trees hash alike. Without a resolver this is
a purely structural hash and is cached on the node itself, so hashing a
tree costs one walk, ever.
```ts
hashCombinator(g: GrammarCombinator): number
```
**Parameters:**
- `g: GrammarCombinator`
**Returns:** `number`

### `hashResolved`
A hash of a combinator tree with its parameter references resolved:
`param` nodes contribute the hash of the argument they name (resolved in
the lexical scope), `ambient` nodes the hash of the dynamic binding they
name (resolved in the dynamic scope captured by that binding, so a
binding's value never depends on itself), and `bind` nodes hash their
body under the dynamic scope the bind creates. Nothing is cached, since
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
