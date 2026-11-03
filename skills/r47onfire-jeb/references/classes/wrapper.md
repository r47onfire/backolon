# Classes

## wrapper

### `Wrapper`
Represents a wrapped value that only appears as a directly-usable value under
certain circumstances
```ts
constructor(obj: any): Wrapper
```
**Properties:**
- `flag: string` — Tag identifying the kind of wrapper. `OP_unwrap` refuses to unwrap a
wrapper whose flag appears in its `dontUnwrap` list.
- `obj: any` — The wrapped value

### `KeywordArg`
Wrapper for a keyword argument that will redirect to the
*extends `Wrapper`*
```ts
constructor(obj: any, name: string): KeywordArg
```
**Properties:**
- `name: string`
*Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)*

### `SplatArg`
Wrapper to cause the object to unpack instead of being passed directly
*extends `Wrapper`*
```ts
constructor(obj: any, isKeyword: boolean): SplatArg
```
**Properties:**
- `isKeyword: boolean`
*Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)*

### `OptionArg`
Sentinel to force the parameter to use its default expression
*extends `Wrapper`*
```ts
constructor(obj: string): OptionArg
```
*Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)*

### `EmptyArg`
Sentinel to force the parameter to use its default expression
*extends `Wrapper`*
```ts
constructor(): EmptyArg
```
*Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)*

### `ReferenceWrapper`
Wrapper for a variable reference
*extends `Wrapper`*
```ts
constructor(obj: Reference): ReferenceWrapper
```
*Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)*

### `MacroWrapper`
Wrapper for a macro result
*extends `Wrapper`*
```ts
constructor(obj: any): MacroWrapper
```
*Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)*
