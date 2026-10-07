# Types & Enums

## parser

### `Grammar`
```ts
Readonly<Record<string, GrammarCombinator>>
```

### `GrammarCombinator`

### `GrammarOp`
```ts
"tok" | "ign" | "rule" | "seq" | "ssep" | "joined" | "alt" | "opt" | "rep" | "if" | "tag" | "cut" | "lookahead" | "nonempty" | "sameline" | "eps" | "die" | "try"
```

### `CSTNode`
```ts
Readonly<{ type?: string; ignored?: boolean; tag?: string; text?: string; start: number; end: number; children?: readonly CSTNode[]; errorExpected?: GrammarCombinator }>
```

### `MemoLoc`
```ts
`${number}#${string}`
```

### `Memo`
```ts
Record<MemoLoc, CSTNode | MatchFail | LR>
```

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
