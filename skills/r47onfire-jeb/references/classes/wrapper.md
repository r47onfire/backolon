# Classes

## wrapper

### `Wrapper`

Represents a wrapped value that only appears as a directly-usable value under certain circumstances

```ts
constructor(obj: any): Wrapper
```

**Properties:**

- `flag: string` — Tag identifying the kind of wrapper. `OP_unwrap` refuses to unwrap a
  wrapper whose flag appears in its `dontUnwrap` list.
- `obj: any` — The wrapped value

### `KeywordArg`

Wrapper for a keyword argument that will redirect to the
_extends `Wrapper`_

```ts
constructor(obj: any, name: string): KeywordArg
```

**Properties:**

- `name: string`
  _Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)_

### `SplatArg`

Wrapper to cause the object to unpack instead of being passed directly
_extends `Wrapper`_

```ts
constructor(obj: any, isKeyword: boolean): SplatArg
```

**Properties:**

- `isKeyword: boolean`
  _Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)_

### `OptionArg`

Sentinel to force the parameter to use its default expression
_extends `Wrapper`_

```ts
constructor(obj: string): OptionArg
```

_Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)_

### `EmptyArg`

Sentinel to force the parameter to use its default expression
_extends `Wrapper`_

```ts
constructor(): EmptyArg
```

_Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)_

### `ReferenceWrapper`

Wrapper for a variable reference
_extends `Wrapper`_

```ts
constructor(obj: Reference): ReferenceWrapper
```

_Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)_

### `MacroWrapper`

Wrapper for a macro result
_extends `Wrapper`_

```ts
constructor(obj: any): MacroWrapper
```

_Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)_
