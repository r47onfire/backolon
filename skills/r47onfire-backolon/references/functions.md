# Functions

## parser

### `literal`
```ts
literal(p: string, t?: string): GrammarCombinator
```
**Parameters:**
- `p: string`
- `t: string` (optional)
**Returns:** `GrammarCombinator`

### `regex`
```ts
regex(p: RegExp, t?: string): GrammarCombinator
```
**Parameters:**
- `p: RegExp`
- `t: string` (optional)
**Returns:** `GrammarCombinator`

### `rule`
```ts
rule(r: string): GrammarCombinator
```
**Parameters:**
- `r: string`
**Returns:** `GrammarCombinator`

### `transform`
```ts
transform(t: string, n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `t: string`
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `sequence`
```ts
sequence(n: GrammarCombinator[]): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator[]`
**Returns:** `GrammarCombinator`

### `alternatives`
```ts
alternatives(n: GrammarCombinator[]): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator[]`
**Returns:** `GrammarCombinator`

### `optional`
```ts
optional(g: boolean, n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `g: boolean`
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `repeat`
```ts
repeat(r: boolean, n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `r: boolean`
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `repeat_seq`
```ts
repeat_seq(r: boolean, n: GrammarCombinator[]): GrammarCombinator
```
**Parameters:**
- `r: boolean`
- `n: GrammarCombinator[]`
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
lookahead(n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `lookaheadNot`
```ts
lookaheadNot(n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `assert_nonempty`
```ts
assert_nonempty(n: GrammarCombinator): GrammarCombinator
```
**Parameters:**
- `n: GrammarCombinator`
**Returns:** `GrammarCombinator`

### `epsilon`
```ts
epsilon(): GrammarCombinator
```
**Returns:** `GrammarCombinator`

### `fail_fast`
```ts
fail_fast(m: string): GrammarCombinator
```
**Parameters:**
- `m: string`
**Returns:** `GrammarCombinator`

### `parseToCST`
```ts
parseToCST(text: string, startIndex: number, startRule: string, grammar: Grammar, memo: Memo): Readonly<{ type?: string; tag?: string; text?: string; transform?: string; start: number; end: number; children?: readonly (Readonly<{ type?: string | undefined; tag?: string | undefined; text?: string | undefined; transform?: string | undefined; start: number; end: number; children?: readonly Readonly<...>[] | undefined; }>)[] }> | MatchFail
```
**Parameters:**
- `text: string`
- `startIndex: number`
- `startRule: string`
- `grammar: Grammar`
- `memo: Memo` — default: `{}`
**Returns:** `Readonly<{ type?: string; tag?: string; text?: string; transform?: string; start: number; end: number; children?: readonly (Readonly<{ type?: string | undefined; tag?: string | undefined; text?: string | undefined; transform?: string | undefined; start: number; end: number; children?: readonly Readonly<...>[] | undefined; }>)[] }> | MatchFail`
