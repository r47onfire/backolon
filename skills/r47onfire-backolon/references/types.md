# Types & Enums

## runtime

### `JSModule`
Interface for what a Javascript module needs to comply with to be able to be
imported.

### `JSONModule`
Interface for a JSON module object
**Properties:**
- `code: any[]`
- `files: string[]`
- `sourceMap: string` (optional)

### `JSONSourceMap`
Not a sourcemap-V3 since the mappings don't have any concept of "compiled
line/pos".
**Properties:**
- `contents: string[]`
- `mappings: [start: number, end: number][][]`

### `BackolonVMState`
The part of BackolonVM state captured by JEB's state snapshot/rollback
mechanism. Module loading state is represented as each cached module's
`parent` link (see Module.parent); restoring it makes half-loaded
modules look unloaded again.
**Properties:**
- `moduleLoad: (Module | null)[]`
- `parser: any`
- `resetParser: boolean`

### `ModuleCacheEntry`
Everything the VM tracks about one registered module.
**Properties:**
- `mod: Module`
- `src: SourceTracker | undefined` — The module's source, once a loader has provided it.
- `map: Span[]` — Source spans registered for this module; a span's index in this array is
part of its Location.
