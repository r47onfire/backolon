# Functions

## parser

### `lit`
```ts
lit(p: string): GrammarCombinator
```
**Parameters:**
- `p: string`
**Returns:** `GrammarCombinator`

### `regex`
```ts
regex(p: RegExp): GrammarCombinator
```
**Parameters:**
- `p: RegExp`
**Returns:** `GrammarCombinator`

### `ignored`
```ts
ignored(n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `rule`
```ts
rule(r: string): GrammarCombinator
```
**Parameters:**
- `r: string`
**Returns:** `GrammarCombinator`

### `seq`
```ts
seq(n: GrammarCombinator[]): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator[]`
**Returns:** `GrammarCombinator`

### `ssep`
```ts
ssep(s: GrammarCombinator, n: GrammarCombinator[]): GrammarCombinator
```
**Parameters:**
- `s: GrammarCombinator`
- `n: GrammarCombinator[]`
**Returns:** `GrammarCombinator`

### `joined`
```ts
joined(j: GrammarCombinator, n: GrammarCombinator, r2: boolean, t: boolean): GrammarCombinator
```
**Parameters:**
- `j: GrammarCombinator`
- `n: GrammarCombinator`
- `r2: boolean`
- `t: boolean`
**Returns:** `GrammarCombinator`

### `alt`
```ts
alt(n: GrammarCombinator[]): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator[]`
**Returns:** `GrammarCombinator`

### `opt`
```ts
opt(n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `rep`
```ts
rep(r: boolean, n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `r: boolean`
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `if_`
```ts
if_(c: GrammarCombinator, t: GrammarCombinator, f: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `c: GrammarCombinator`
- `t: GrammarCombinator`
- `f: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `tag`
```ts
tag(t: string, n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `t: string`
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `cut`
```ts
cut(d: number): GrammarCombinator
```
**Parameters:**
- `d: number` — default: `1`
**Returns:** `GrammarCombinator`

### `lookahead`
```ts
lookahead(p: boolean, n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `p: boolean`
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `nonempty`
```ts
nonempty(n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `sameline`
```ts
sameline(n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `eps`
```ts
eps(): GrammarCombinator
```
**Returns:** `GrammarCombinator`

### `die`
```ts
die(m: string): GrammarCombinator
```
**Parameters:**
- `m: string`
**Returns:** `GrammarCombinator`

### `try_`
```ts
try_(n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

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
```ts
stripInlinedFunctions<T>(ast: T): T
```
**Parameters:**
- `ast: T`
**Returns:** `T`

### `describe`
```ts
describe(g: GrammarCombinator): string
```
**Parameters:**
- `g: GrammarCombinator`
**Returns:** `string`
