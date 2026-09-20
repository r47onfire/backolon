# Functions

## builtins

### `loadBuiltins`
Install the built-in functions and opcodes to the builtins scope of the given VM.

Usually you don't need to do this, since the JebVM constructor calls this automatically,
but it might be needed if the VM state gets corrupted, or you mess with JebVM#builtinsEnv directly.
```ts
loadBuiltins(vm: JebVM): void
```
**Parameters:**
- `vm: JebVM`

## define

### `makeJSFun`
Creates a builtin function.
```ts
makeJSFun<V, T>(name: Identifier, signature: T, fn: (args: Record<ShorthandToLonghand<T>[number]["name"], unknown> & (ExtractRest<T, true> extends { name: N } ? { [x in PropertyKey]: unknown[] } : {}) & (ExtractRest<T, false> extends { name: N } ? { [x in PropertyKey]: Record<PropertyKey, unknown> } : {}), vm: V, location: Location | undefined) => any, doc: string): JSFun<JebVM<any>, CallableSignatureFromShorthand<T>>
```
**Parameters:**
- `name: Identifier`
- `signature: T` — Defines the parameters of the function and how they should be interpreted
- `fn: (args: Record<ShorthandToLonghand<T>[number]["name"], unknown> & (ExtractRest<T, true> extends { name: N } ? { [x in PropertyKey]: unknown[] } : {}) & (ExtractRest<T, false> extends { name: N } ? { [x in PropertyKey]: Record<PropertyKey, unknown> } : {}), vm: V, location: Location | undefined) => any` — The function to implement the builtin. It should use the VM from the parameter, and **not**
close over the one that is passed to the `vm` parameter of `defineBuiltin` (since this builtin may be reused for a sub-VM for
e.g. an FFI callback).
- `doc: string`
**Returns:** `JSFun<JebVM<any>, CallableSignatureFromShorthand<T>>` — the builtin function, for referring to later

### `define`
Defines the object in the VM's builtins scope as a constant.
```ts
define(vm: JebVM, name: Identifier, obj: any): void
```
**Parameters:**
- `vm: JebVM`
- `name: Identifier`
- `obj: any`

### `makeOpcode`
Creates a new opcode for the VM.
```ts
makeOpcode<T>(id: string | null, fn: T, doc: string | null): T
```
**Parameters:**
- `id: string | null`
- `fn: T` — The function to implement the opcode.
- `doc: string | null`
**Returns:** `T`

### `defineApplier`
Defines a new applier that can be used by the `jeb:apply` opcode to call something.
```ts
defineApplier<V, T, PO>(vm: V, type: T, run: PO["run"], describe: PO["describe"], doc: string): void
```
**Parameters:**
- `vm: V`
- `type: T`
- `run: PO["run"]` — Should push opcodes to take the arguments object from the top of the stack and pass them to whatever the implementation is.
It should not actually call that implementation as the arguments object is not actually on the stack at the point this is called.
- `describe: PO["describe"]` — Returns the metadata of the function, which includes the signature (see CallableSignature)
- `doc: string`

### `defineEvaluator`
Defines a new evaluator that can be used by the `jeb:eval` opcode to evaluate or unwrap something.
```ts
defineEvaluator<V, T>(vm: JebVM, type: T, fn: (this: unknown, vm: V, args: [TypeValue<T[number]>], flags: EvalFlags) => void, doc: string): void
```
**Parameters:**
- `vm: JebVM`
- `type: T`
- `fn: (this: unknown, vm: V, args: [TypeValue<T[number]>], flags: EvalFlags) => void`
- `doc: string`

### `defineAccessor`
Defines a new accessor that can be used by the `jeb:get` and `jeb:set` opcodes to look up or reassign a field on something.
```ts
defineAccessor<V, T>(vm: JebVM, type: T, fn: (this: unknown, vm: V, args: [TypeValue<T[number]>], flags: AccessFlags) => Reference, doc: string): void
```
**Parameters:**
- `vm: JebVM`
- `type: T`
- `fn: (this: unknown, vm: V, args: [TypeValue<T[number]>], flags: AccessFlags) => Reference`
- `doc: string`

### `defineUnwrapper`
Defines a new unwrapper to define how a special wrapper should be unwrapped.
```ts
defineUnwrapper<V, T>(vm: JebVM, type: T, fn: (this: unknown, vm: V, args: [TypeValue<T[number]>], flags: void) => void, doc: string): void
```
**Parameters:**
- `vm: JebVM`
- `type: T`
- `fn: (this: unknown, vm: V, args: [TypeValue<T[number]>], flags: void) => void`
- `doc: string`

## env

### `gensym`
Returns a new unique symbol with a unique number description (to differentiate it in printouts).
```ts
gensym(s: string): symbol
```
**Parameters:**
- `s: string` — default: `"$gensym"`
**Returns:** `symbol`

## errnoInheritance

### `errnoIsSubclass`
```ts
errnoIsSubclass(sub: ErrnoCode, super_: ErrnoCode): boolean
```
**Parameters:**
- `sub: ErrnoCode`
- `super_: ErrnoCode`
**Returns:** `boolean`

## errors

### `createStackLeafNode`
```ts
createStackLeafNode(name: Identifier | undefined, location: Location | undefined): StackTreeNode
```
**Parameters:**
- `name: Identifier | undefined`
- `location: Location | undefined`
**Returns:** `StackTreeNode`

### `createStackInnerNode`
```ts
createStackInnerNode(count: number, children: StackTreeNode[]): StackTreeNode
```
**Parameters:**
- `count: number`
- `children: StackTreeNode[]`
**Returns:** `StackTreeNode`

### `compressStackTree`
```ts
compressStackTree(nodes: StackTreeNode[]): StackTreeNode[]
```
**Parameters:**
- `nodes: StackTreeNode[]`
**Returns:** `StackTreeNode[]`

### `locationsEqual`
```ts
locationsEqual(location1: Location | undefined, location2: Location | undefined): boolean
```
**Parameters:**
- `location1: Location | undefined`
- `location2: Location | undefined`
**Returns:** `boolean`

### `formatStackTraceCompact`
Formats a stack tree as a compact string representation
```ts
formatStackTraceCompact(nodes: StackTreeNode[]): string
```
**Parameters:**
- `nodes: StackTreeNode[]` — The compressed stack tree nodes
**Returns:** `string` — A formatted string like "foo &lt;- bar &lt;- (baz * 3) &lt;- qux"

### `wrapThrowToError`
Runs the function, and if it throws an error that isn't a JEBError,
wraps it in the given error type and re-throws it, otherwise returns the function result.
```ts
wrapThrowToError<T>(kind: ErrnoCode, f: () => T): T
```
**Parameters:**
- `kind: ErrnoCode` — Kind of JEB error a thrown error causes
- `f: () => T` — The function to catch errors from
**Returns:** `T`
```
defineBuiltin(vm, "test", null, false, false,
    (vm, args) => wrapThrowToError(vm, "test:testError",
        () => doSomethingThatMayThrow(vm, args[0])));
```

### `checkNothingOrPush`
Pushes the value to the VM's data stack, but only if the value is not NOTHING.
```ts
checkNothingOrPush<T>(vm: T, value: any): void
```
**Parameters:**
- `vm: T` — VM we're running in
- `value: any` — Value to check

### `promisifyVM`
Pauses the VM while the promise is pending, and then resumes it when it
resolves or rejects.
```ts
promisifyVM<T, X>(vm: T, promise: Promise<X>): typeof NOTHING
```
**Parameters:**
- `vm: T`
- `promise: Promise<X>`
**Returns:** `typeof NOTHING`

## implicitBegin

### `implicitBegin`
Sets up instructions to run all of the arguments in order and the result is the value of the last one.
```ts
implicitBegin(vm: JebVM, args: any[]): symbol
```
**Parameters:**
- `vm: JebVM` — VM to evaluate in
- `args: any[]` — List of things to evaluate
**Returns:** `symbol` — - NOTHING

## math

### `numberOp`
Wraps a numeric function to automatically work with both numbers and bigints and automatically upcast
or downcast as needed to keep precision okay (divsion needs to be handled separately; bigint/bigint will still round)
```ts
numberOp(cb: BinaryFun): (a: number | bigint, b: number | bigint) => number | bigint
```
**Parameters:**
- `cb: BinaryFun` — The function that will be called as either `(a: number, b: number) =&gt; number` or `(a: bigint, b: bigint) =&gt; bigint` (the types are all `any` due to typescript shenanigans)
**Returns:** `(a: number | bigint, b: number | bigint) => number | bigint` — the wrapped function that can be called with any number or bigint combination

## protocol

### `typeMatches`
Matches the object's type to the given specifier
```ts
typeMatches(obj: any, type: Type): number
```
**Parameters:**
- `obj: any` — The object to check
- `type: Type` — The type specifier
**Returns:** `number` — Score of the match, higher is a closer match, 0 is no match

### `theTypeName`
```ts
theTypeName(type: Type): string
```
**Parameters:**
- `type: Type`
**Returns:** `string`

### `typeOf`
```ts
typeOf(x: any): Type
```
**Parameters:**
- `x: any`
**Returns:** `Type`

### `withType`
```ts
withType<T>(x: unknown, t: T, paramName?: string): TypeValue<T[number]>
```
**Parameters:**
- `x: unknown`
- `t: T`
- `paramName: string` (optional)
**Returns:** `TypeValue<T[number]>`

### `getProtocolHandler`
```ts
getProtocolHandler<V>(protocols: Partial<JEBProtocols<V>>, fast: boolean, name: PropertyKey, args: any[]): BaseProtocolObj<V, any, any[], {}, any> | DescribedProtocolObj<V, any, any[], {}, any, any> | undefined
```
**Parameters:**
- `protocols: Partial<JEBProtocols<V>>`
- `fast: boolean`
- `name: PropertyKey`
- `args: any[]`
**Returns:** `BaseProtocolObj<V, any, any[], {}, any> | DescribedProtocolObj<V, any, any[], {}, any, any> | undefined`

## signature

### `createSignature`
```ts
createSignature<S>(signature: S): CallableSignatureFromShorthand<S>
```
**Parameters:**
- `signature: S`
**Returns:** `CallableSignatureFromShorthand<S>`

## utils

### `isIdentifier`
```ts
isIdentifier(x: unknown): x is Identifier
```
**Parameters:**
- `x: unknown`
**Returns:** `x is Identifier`

## vm

### `pushData`
```ts
pushData<T>(vm: T, data: any): void
```
**Parameters:**
- `vm: T`
- `data: any`

### `pushCommand`
```ts
pushCommand<T, U>(vm: U, cmd: T, args: GetArgParams<T>): void
```
**Parameters:**
- `vm: U`
- `cmd: T`
- `args: GetArgParams<T>`

### `popData`
```ts
popData<T>(vm: T): any
```
**Parameters:**
- `vm: T`
**Returns:** `any`

### `popNData`
```ts
popNData<T>(vm: T, n: number): any[]
```
**Parameters:**
- `vm: T`
- `n: number`
**Returns:** `any[]`

### `peekData`
```ts
peekData<T>(vm: T): any
```
**Parameters:**
- `vm: T`
**Returns:** `any`

## initializers

### `__initializer`
```ts
__initializer(f: (x: JebVM) => void): void
```
**Parameters:**
- `f: (x: JebVM) => void`
