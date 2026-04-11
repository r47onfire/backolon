# Functions

## `fromJS`
Convert a native JavaScript value into a Backolon Thing.
```ts
fromJS(val: any, loc: LocationTrace): Thing
```
**Parameters:**
- `val: any` — 
- `loc: LocationTrace` — default: `UNKNOWN_LOCATION` — 
**Returns:** `Thing`

## `toJS`
Convert a Backolon Thing into a native JavaScript value.
```ts
toJS(thing: Thing): any
```
**Parameters:**
- `thing: Thing` — 
**Returns:** `any`

## `mapDeleteKeyCopying`
Return a new Backolon map without the given key, or the original if the key is already gone.
```ts
mapDeleteKeyCopying(map: Thing<map>, key: Thing, opTrace?: LocationTrace): Thing<map>
```
**Parameters:**
- `map: Thing<map>` — 
- `key: Thing` — 
- `opTrace: LocationTrace` (optional) — 
**Returns:** `Thing<map>`

## `mapDeleteKeyMutating`
Remove a key from a Backolon map by mutating the map. If the key is not present, nothing happens.
```ts
mapDeleteKeyMutating(map: Thing<map>, key: Thing, opTrace?: LocationTrace): void
```
**Parameters:**
- `map: Thing<map>` — 
- `key: Thing` — 
- `opTrace: LocationTrace` (optional) — 

## `mapGetKey`
Read a value from a Backolon map by key. The key must be hashable, throws if it's not.
Returns undefined if the key is not found.
```ts
mapGetKey(map: Thing<map>, key: Thing, opTrace?: LocationTrace): Thing<string | ThingType> | undefined
```
**Parameters:**
- `map: Thing<map>` — 
- `key: Thing` — 
- `opTrace: LocationTrace` (optional) — 
**Returns:** `Thing<string | ThingType> | undefined`

## `mapUpdateKeyCopying`
Return a new Backolon map with the given key inserted or updated. The original map is not modified.
```ts
mapUpdateKeyCopying(map: Thing<map>, key: Thing, item: Thing, opTrace?: LocationTrace): Thing<map>
```
**Parameters:**
- `map: Thing<map>` — 
- `key: Thing` — 
- `item: Thing` — 
- `opTrace: LocationTrace` (optional) — 
**Returns:** `Thing<map>`

## `mapUpdateKeyMutating`
Add or update the value at the specified key, mutating the map.
```ts
mapUpdateKeyMutating(map: Thing<map>, key: Thing, item: Thing, opTrace?: LocationTrace): void
```
**Parameters:**
- `map: Thing<map>` — 
- `key: Thing` — 
- `item: Thing` — 
- `opTrace: LocationTrace` (optional) — 

## `newEmptyMap`
Create an empty Backolon map.
```ts
newEmptyMap(srcLocation: LocationTrace): Thing<map>
```
**Parameters:**
- `srcLocation: LocationTrace` — default: `UNKNOWN_LOCATION` — 
**Returns:** `Thing<map>`

## `boxBlock`
```ts
boxBlock<T>(children: T extends ThingType ? ChildrenType<T> : Thing<string | ThingType>[], kind: T, trace: LocationTrace, start: string, end: string): Thing<T>
```
**Parameters:**
- `children: T extends ThingType ? ChildrenType<T> : Thing<string | ThingType>[]` — 
- `kind: T` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
- `start: string` — 
- `end: string` — 
**Returns:** `Thing<T>`

## `boxCurlyBlock`
```ts
boxCurlyBlock(children: readonly Thing<string | ThingType>[], trace: LocationTrace): Thing<curlyblock>
```
**Parameters:**
- `children: readonly Thing<string | ThingType>[]` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
**Returns:** `Thing<curlyblock>`

## `boxEnd`
```ts
boxEnd(trace: LocationTrace): Thing<end>
```
**Parameters:**
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
**Returns:** `Thing<end>`

## `boxList`
```ts
boxList(items: Thing<string | ThingType>[], trace: LocationTrace, start: string, end: string, join: string): Thing<list>
```
**Parameters:**
- `items: Thing<string | ThingType>[]` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
- `start: string` — default: `"["` — 
- `end: string` — default: `"]"` — 
- `join: string` — default: `", "` — 
**Returns:** `Thing<list>`

## `boxNameSymbol`
```ts
boxNameSymbol(value: string, trace: LocationTrace): Thing<name>
```
**Parameters:**
- `value: string` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
**Returns:** `Thing<name>`

## `boxNil`
```ts
boxNil(trace: LocationTrace, str: string): Thing<nil>
```
**Parameters:**
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
- `str: string` — default: `"nil"` — 
**Returns:** `Thing<nil>`

## `boxNumber`
```ts
boxNumber(value: number | bigint, trace: LocationTrace, repr: string): Thing<number>
```
**Parameters:**
- `value: number | bigint` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
- `repr: string` — default: `...` — 
**Returns:** `Thing<number>`

## `boxOperatorSymbol`
```ts
boxOperatorSymbol(value: string, trace: LocationTrace): Thing<operator>
```
**Parameters:**
- `value: string` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
**Returns:** `Thing<operator>`

## `boxRoundBlock`
```ts
boxRoundBlock(children: readonly Thing<string | ThingType>[], trace: LocationTrace): Thing<roundblock>
```
**Parameters:**
- `children: readonly Thing<string | ThingType>[]` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
**Returns:** `Thing<roundblock>`

## `boxSpaceSymbol`
```ts
boxSpaceSymbol(value: string, trace: LocationTrace): Thing<space>
```
**Parameters:**
- `value: string` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
**Returns:** `Thing<space>`

## `boxSquareBlock`
```ts
boxSquareBlock(children: readonly Thing<string | ThingType>[], trace: LocationTrace): Thing<squareblock>
```
**Parameters:**
- `children: readonly Thing<string | ThingType>[]` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
**Returns:** `Thing<squareblock>`

## `boxString`
```ts
boxString(value: string, trace: LocationTrace, raw: string, quote: string): Thing<string>
```
**Parameters:**
- `value: string` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
- `raw: string` — 
- `quote: string` — 
**Returns:** `Thing<string>`

## `boxSymbol`
```ts
boxSymbol<T>(value: string, kind: T, trace: LocationTrace): Thing<T>
```
**Parameters:**
- `value: string` — 
- `kind: T` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
**Returns:** `Thing<T>`

## `boxToplevelBlock`
```ts
boxToplevelBlock(children: readonly Thing<string | ThingType>[], trace: LocationTrace): Thing<topblock>
```
**Parameters:**
- `children: readonly Thing<string | ThingType>[]` — 
- `trace: LocationTrace` — default: `UNKNOWN_LOCATION` — 
**Returns:** `Thing<topblock>`

## `typecheck`
Return a helper function that returns true if the given Thing is any of the given types.
```ts
typecheck<T>(types: T[]): (thing: Thing<any>) => thing is OneTypeThing<T>
```
**Parameters:**
- `types: T[]` — 
**Returns:** `(thing: Thing<any>) => thing is OneTypeThing<T>`
```js
if (typecheck(ThingType.number, ThingType.string)(object)) {
    // inside this block, object is known to be
    // Thing<ThingType.number> | Thing<ThingType.string>
}
```

## `typeNameOf`
Returns the human-readable name of a ThingType, or returns the string itself if it's not a ThingType.
```ts
typeNameOf(type: string | ThingType): string
```
**Parameters:**
- `type: string | ThingType` — 
**Returns:** `string`

## `parse`
Parse Backolon source text into a syntax tree of Thing objects, but do not apply any patterns.
```ts
parse(string: string, filename: URL): Thing<string | ThingType>
```
**Parameters:**
- `string: string` — 
- `filename: URL` — default: `UNKNOWN_LOCATION.file` — 
**Returns:** `Thing<string | ThingType>`

## `tokenize`
Tokenize Backolon source text into a stream of Things. No further parsing is done;
parens like "(" are kept as operator symbols.
```ts
tokenize(source: string, filename: URL): Token[]
```
**Parameters:**
- `source: string` — 
- `filename: URL` — default: `UNKNOWN_LOCATION.file` — 
**Returns:** `Token[]`

## `matchPattern`
Finds all of the matches of the pattern and returns (for each match) the bindings
and the span.

Uses a tree-walking version of Thompson's NFA construction internally, for speed.
```ts
matchPattern(source: readonly Thing<string | ThingType>[], pattern: Thing<pattern>, findAll: boolean): MatchResult[]
```
**Parameters:**
- `source: readonly Thing<string | ThingType>[]` — Stream of tokens to be fed to the pattern matching.
- `pattern: Thing<pattern>` — A single parsed pattern tree to match against the source.
- `findAll: boolean` — default: `true` — Whether to find all matches, if true, or stop early when the leftmost match is found, if false. (Default true)
**Returns:** `MatchResult[]`

## `parsePattern`
Convert a parsed Backolon pattern block into an internal pattern Thing.

pattern syntax:
* `<one space>` --> any amount (zero or more) of spaces or newlines
* `<two spaces>` --> any amount (zero or more) of spaces, but no newlines
* `<three spaces>` --> one or more spaces (space is required) without newlines
* `<newline>` --> newline literal
* `x` --> wildcard capture of any element named x
* `x ...` --> repeat `x` (lazy)
* `x ... [+]` --> repeat `x` (greedy) where `[+]` is a square bracket containing `+`
* `(x)` --> grouping (parenthesised pattern)
* `{x|y}` --> alternation (either `x` or `y`)
* `[x(stuff)]` --> capture name with subpattern
* `[x: roundblock]` --> type match & capture
* `[=xyz]` --> literal match (can be symbol, number, string)
* `[^]` and `[$]` --> anchors
* number or string literal --> not allowed
```ts
parsePattern(block: readonly Thing<string | ThingType>[]): Thing<pattern>
```
**Parameters:**
- `block: readonly Thing<string | ThingType>[]` — 
**Returns:** `Thing<pattern>`

## `pattern`
```ts
pattern(type: PatternType, gsv: number | boolean, loc: LocationTrace, children: readonly Thing<string | ThingType>[], start: string, end: string, join: string): Thing<pattern>
```
**Parameters:**
- `type: PatternType` — 
- `gsv: number | boolean` — 
- `loc: LocationTrace` — default: `UNKNOWN_LOCATION` — 
- `children: readonly Thing<string | ThingType>[]` — default: `[]` — 
- `start: string` — default: `""` — 
- `end: string` — default: `""` — 
- `join: string` — default: `""` — 
**Returns:** `Thing<pattern>`

## `newEnv`
Create a new Backolon environment frame with variables and pattern definitions.
```ts
newEnv(newVars: Thing<map>, newPatterns: Thing<list>, callsite: LocationTrace, parents: Thing<nil | env>[]): Thing<env>
```
**Parameters:**
- `newVars: Thing<map>` — 
- `newPatterns: Thing<list>` — 
- `callsite: LocationTrace` — 
- `parents: Thing<nil | env>[]` — default: `...` — 
**Returns:** `Thing<env>`

## `rewriteAsApply`
Helper to rewrite pattern handlers into apply forms for native builtins.
```ts
rewriteAsApply(symbols: Thing<name>[], builtinName: string, start?: string, end?: string): (task: Task, arg: StackEntry) => void
```
**Parameters:**
- `symbols: Thing<name>[]` — 
- `builtinName: string` — 
- `start: string` (optional) — 
- `end: string` (optional) — 
**Returns:** `(task: Task, arg: StackEntry) => void`
