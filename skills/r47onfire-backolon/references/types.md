# Types & Enums

## parser

### `ParseletContext`
```ts
ReturnType<typeof makeParseletContext>
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
