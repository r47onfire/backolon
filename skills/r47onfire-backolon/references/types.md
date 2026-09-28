# Types & Enums

## parser

### `GrammarCombinator`
```ts
Readonly<{ op: "token"; type?: string; pattern: string; flags?: string; isRegex: boolean } | { op: "rule"; rule: string } | { op: "transform"; transformer: string; node: GrammarCombinator } | { op: "sequence"; nodes: GrammarCombinator[] } | { op: "alternatives"; nodes: GrammarCombinator[] } | { op: "optional"; greedy: boolean; node: GrammarCombinator } | { op: "repeat"; required: boolean; node: GrammarCombinator } | { op: "repeat_seq"; required: boolean; nodes: GrammarCombinator[] } | { op: "tag"; tag: string; node: GrammarCombinator } | { op: "cut"; depth: number } | { op: "lookahead"; negative: boolean; node: GrammarCombinator } | { op: "assert_nonempty"; node: GrammarCombinator } | { op: "nothing" } | { op: "fail_fast"; message: string }>
```

### `CSTNode`
```ts
Readonly<{ type?: string; tag?: string; text?: string; transform?: string; start: number; end: number; children?: readonly CSTNode[] }>
```

### `MemoLoc`
```ts
`${number}#${string}`
```

### `Memo`
```ts
Record<MemoLoc, CSTNode | MatchFail | LR>
```

### `Grammar`
```ts
Readonly<Record<string, GrammarCombinator>>
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
