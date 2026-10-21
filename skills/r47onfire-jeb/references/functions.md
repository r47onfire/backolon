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
makeJSFun<V, T>(name: Identifier, signature: T, fn: (args: Record<ShorthandToLonghand<T>[number]["name"], unknown> & (ExtractRest<T, true> extends { name: N } ? { [x in PropertyKey]: unknown[] } : {}) & (ExtractRest<T, false> extends { name: N } ? { [x in PropertyKey]: Record<PropertyKey, unknown> } : {}), vm: V, location: Location | undefined) => any, doc: string): JSFun<V, CallableSignatureFromShorthand<T>>
```
**Parameters:**
- `name: Identifier`
- `signature: T` — Defines the parameters of the function and how they should be interpreted
- `fn: (args: Record<ShorthandToLonghand<T>[number]["name"], unknown> & (ExtractRest<T, true> extends { name: N } ? { [x in PropertyKey]: unknown[] } : {}) & (ExtractRest<T, false> extends { name: N } ? { [x in PropertyKey]: Record<PropertyKey, unknown> } : {}), vm: V, location: Location | undefined) => any` — The function to implement the builtin. It should use the VM from the parameter, and **not**
close over the one that is passed to the `vm` parameter of `defineBuiltin` (since this builtin may be reused for a sub-VM for
e.g. an FFI callback).
- `doc: string`
**Returns:** `JSFun<V, CallableSignatureFromShorthand<T>>` — the builtin function, for referring to later

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
Whether `sub` is the same code as `super_` or inherits from it, directly or
transitively, following the ErrnoParent links.
```ts
errnoIsSubclass(sub: ErrnoCode, super_: ErrnoCode): boolean
```
**Parameters:**
- `sub: ErrnoCode`
- `super_: ErrnoCode`
**Returns:** `boolean`

## errors

### `createStackLeafNode`
Creates a leaf stack tree node for a single call frame. The node's hash is
precomputed from the frame name and location so that equal frames can be
recognized (and folded together) by compressStackTree.
```ts
createStackLeafNode(name: Identifier | undefined, location: Location | undefined): StackTreeNode
```
**Parameters:**
- `name: Identifier | undefined`
- `location: Location | undefined`
**Returns:** `StackTreeNode`

### `createStackInnerNode`
Creates an inner stack tree node representing `count` repetitions of the
given child frames, with its hash precomputed from the children's hashes.
```ts
createStackInnerNode(count: number, children: StackTreeNode[]): StackTreeNode
```
**Parameters:**
- `count: number`
- `children: StackTreeNode[]`
**Returns:** `StackTreeNode`

### `compressStackTree`
Compresses a list of stack frames by folding each run of consecutively
repeating frame patterns into a single inner node (see StackTreeNode),
recursively, so that tracebacks of deeply recursive programs stay readable.
```ts
compressStackTree(nodes: StackTreeNode[]): StackTreeNode[]
```
**Parameters:**
- `nodes: StackTreeNode[]`
**Returns:** `StackTreeNode[]`

### `locationsEqual`
Whether two (possibly undefined) Locations denote the same place.
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
wrapThrowToError(vm, ErrnoCode.EJAVASCRIPT,
    () => doSomethingThatMayThrow(vm, args[0]));
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
Human-readable name of a Type specifier, for error messages.
```ts
theTypeName(type: Type): string
```
**Parameters:**
- `type: Type`
**Returns:** `string`

### `typeOf`
The Type specifier describing a value: its constructor, for objects
with a non-plain prototype, and its `typeof` string otherwise.
```ts
typeOf(x: any): Type
```
**Parameters:**
- `x: any`
**Returns:** `Type`

### `withType`
Like typecheck, but returns `x` (typed as the matched type) on success.
```ts
withType<T>(x: unknown, t: T, paramName?: string): TypeValue<T[number]>
```
**Parameters:**
- `x: unknown`
- `t: T`
- `paramName: string` (optional)
**Returns:** `TypeValue<T[number]>`

### `getProtocolHandler`
Selects the implementation of the protocol `name` to use for the given
arguments. Each registered implementation is scored by how specifically its
argument types match (see typeMatches); the highest score wins,
with later registrations preferred over earlier ones with the same score.
If `fast` is set, the first (most recently registered) implementation that
matches at all is used instead of searching for the best-scoring one.
```ts
getProtocolHandler<V>(protocols: Partial<JEBProtocols<V>>, fast: boolean, name: PropertyKey, args: any[]): BaseProtocolObj<V, any, any[], {}, any> | DescribedProtocolObj<V, any, any[], {}, any, any> | undefined
```
**Parameters:**
- `protocols: Partial<JEBProtocols<V>>`
- `fast: boolean`
- `name: PropertyKey`
- `args: any[]`
**Returns:** `BaseProtocolObj<V, any, any[], {}, any> | DescribedProtocolObj<V, any, any[], {}, any, any> | undefined` — the chosen implementation, or `undefined` if none of them matches
**Throws:** A JEBError (`ENOSYS`) if the protocol itself doesn't exist

## signature

### `createSignature`
Converts a shorthand signature into its CallableSignature longhand
form, validating it in the process.
```ts
createSignature<S>(signature: S): CallableSignatureFromShorthand<S>
```
**Parameters:**
- `signature: S`
**Returns:** `CallableSignatureFromShorthand<S>`
**Throws:** A JEBError (`ESYNTAX`) if the signature is malformed, e.g.
a required parameter follows an optional one, a rest parameter has a
default, is duplicated, or is followed by further parameters.

## utils

### `isIdentifier`
Type guard for Identifier.
```ts
isIdentifier(x: unknown): x is Identifier
```
**Parameters:**
- `x: unknown`
**Returns:** `x is Identifier`

## vm

### `pushData`
Standalone form of JebVM.pushData, for opcodes (which receive the
VM and their arguments separately rather than as a method receiver).
```ts
pushData<T>(vm: T, data: any): void
```
**Parameters:**
- `vm: T`
- `data: any`

### `pushCommand`
Standalone form of JebVM.pushCommand; see pushData.
```ts
pushCommand<T, U>(vm: U, cmd: T, args: GetArgParams<T>): void
```
**Parameters:**
- `vm: U`
- `cmd: T`
- `args: GetArgParams<T>`

### `popData`
Standalone form of JebVM.popData; see pushData.
```ts
popData<T>(vm: T): any
```
**Parameters:**
- `vm: T`
**Returns:** `any`

### `popNData`
Standalone form of JebVM.popNData; see pushData.
```ts
popNData<T>(vm: T, n: number): any[]
```
**Parameters:**
- `vm: T`
- `n: number`
**Returns:** `any[]`

### `peekData`
Standalone form of JebVM.peekData; see pushData.
```ts
peekData<T>(vm: T): any
```
**Parameters:**
- `vm: T`
**Returns:** `any`

## initializers

### `__initializer`
Registers a callback to be run for every VM created from now on
(see __initializers).
```ts
__initializer(f: (x: JebVM) => void): void
```
**Parameters:**
- `f: (x: JebVM) => void`
