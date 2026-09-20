# Classes

## block

### `Block`
A chunk of code that will be deferred evaluation, like an implicit lambda
```ts
constructor(closureEnv: Env, body: any[]): Block
```
**Properties:**
- `closureEnv: Env`
- `body: any[]`

## callable

### `CallableClass`
Callable hack from https://stackoverflow.com/a/78553691. Subclasses of this
are actually instances of `Function`, so `typeof this === "function"`.
*extends `(Anonymous class)<this>`*
```ts
constructor(): CallableClass
```
**Methods:**
- `__call__(args: any[]): any` — Called when the object is invoked as a function (i.e. `this(...)`)
- `__new__(args: any[]): any` — Called when the object is invoked as a class constructor (i.e. `new this(...)`)

### `JSFun`
Wrapper for a Javascript function that can be called by the JEB runtime.
The Javascript function has access to the VM so it can push opcodes to
implement more than just computation.
*implements `HasDocstring`, `ApplyMetadata`*
```ts
constructor<T, S>(name: Identifier, signature: S, impl: (args: Record<S["params"][number]["name"], unknown> & (S["rest"] extends { name: N } ? { [x in PropertyKey]: unknown[] } : {}) & (S["kwRest"] extends { name: N } ? { [x in PropertyKey]: Record<PropertyKey, unknown> } : {}), vm: T, location: Location | undefined) => any, doc: string): JSFun<T, S>
```
**Properties:**
- `name: Identifier` — The name of the function as it should appear in a traceback.
- `signature: S`
- `impl: (args: Record<S["params"][number]["name"], unknown> & (S["rest"] extends { name: N } ? { [x in PropertyKey]: unknown[] } : {}) & (S["kwRest"] extends { name: N } ? { [x in PropertyKey]: Record<PropertyKey, unknown> } : {}), vm: T, location: Location | undefined) => any` — The javascript function implementation.

If the function returns the special value NOTHING, no
value will be pushed as the result of the function call. Otherwise, the
return value is pushed (even if it's `undefined`).
- `doc: string` — The docstring given - should define the allowable syntax(es) of the function
or macro and give a description of its behavior.

### `Fun`
A Fun is a callable function or macro implemented as JEB code instead of
a Javascript function.
*extends `CallableClass`*
*implements `HasDocstring`, `ApplyMetadata`*
```ts
constructor<S>(isImplicit: boolean, name: Identifier | undefined, signature: S, body: Block, doc: string): Fun<S>
```
**Properties:**
- `isImplicit: boolean` — Whether the function should be hidden from stack traces.
- `name: Identifier | undefined` — The name of the function as it should appear in a traceback. Ignored if isImplicit=true
- `signature: S`
- `body: Block` — The body code that will be evaluated in the new scope with the argument values bound.
- `doc: string` — The docstring given - should define the allowable syntax(es) of the function
or macro and give a description of its behavior.
**Methods:**
- `__call__(): never` — JEB lambdas are currently not callable via javascript.
- `__new__(): never` — JEB lambda are not class constructors.

## continuation

### `Continuation`
A continuation which holds all the VM state, and can restore it at any time
```ts
constructor<T>(vm: T, extraOps: Command<T>[]): Continuation<T>
```
**Properties:**
- `env: Env` — Closed-over environment
- `commands: LinkedList<Command<T>>` — Closed-over command stack in progress
- `data: LinkedList<any>` — Closed-over data stack in progress
- `winders: DynamicWind<T>` — Closed-over dynamic wind stack in progress
- `traceback: LinkedList<StackCount>` — Closed-over traceback stack in progress
- `state: ReturnType<T["getState"]>` — Other saved state
**Methods:**
- `invoke(vm: T, data: any): void` — Call the continuation and restore the state of the VM

### `DynamicWind`
Node in a dynamic wind tree
```ts
constructor<T>(vm: T): DynamicWind<T>
```
**Properties:**
- `handler: Windable | null`
- `envHere: Env` — current env at the point of the dynamic wind start
- `parent: DynamicWind<T> | null`
- `commandsHere: LinkedList<Command<T>>` — closed-over command stack
- `dataHere: LinkedList<any>` — closed-over data stack
- `stateHere: ReturnType<T["getState"]>` — Other saved state
**Methods:**
- `setHandler(handler: Windable): void` — sets the handler after it has been processed
- `processJumpHere(vm: T): void` — processes the jump here, and adds instructions to call the enter and exit handlers
- `restore(vm: T): void` — Restores the dynamic wind state when an error occurs

## env

### `Env`
Key-value store for managing an environment, with inheritance from parent environments.
```ts
constructor(bindings: Record<Identifier, any>, parents: readonly Env[]): Env
```
**Properties:**
- `constants: Record<Identifier, true>`
- `bindings: Record<Identifier, any>`
- `parents: readonly Env[]`
**Methods:**
- `get(name: Identifier): Result<any, void>` — Look up the value, and return its value (in an ok result)
or an err result if not found
- `add(name: Identifier, value: any): void` — Defines the value in this scope (always succeeds)
- `addConst(name: Identifier, value: any): void` — Defines the constant in this scope (always succeeds)
- `set(name: Identifier, value: any): boolean | undefined` — Finds the scope in which this value is defined, and sets it there.
Returns true if it was set, false if it's a constant and can't be changed,
or undefined if it wasn't defined anywhere.

## errors

### `JEBError`
Generic base class for an error thrown by a JEB program.
*extends `Error`*
```ts
constructor(code: ErrnoCode, message?: string, options: ErrorOptions & JEBErrorOptions, context: JEBErrorContext, traceback?: StackTreeNode[]): JEBError
```
**Properties:**
- `children: JEBError[]`
- `code: ErrnoCode`
- `options: ErrorOptions & JEBErrorOptions`
- `context: JEBErrorContext`
- `traceback: StackTreeNode[]` (optional)
**Methods:**
- `toString(): string` — Returns a string representation of an object.

## protocol

### `Reference`
Represents a slot that can be assigned to
```ts
constructor(type: AccessType): Reference
```
**Properties:**
- `type: AccessType`
**Methods:**
- `get(vm: JebVM, shouldBind: boolean): any` — Returns the current value, or returns `NOTHING` and throws an error (in the VM, not Javascript) if it's not readable.
- `set(vm: JebVM, value: any, createIfNotFound: boolean, makeConstant: boolean): void` — Set the value of the slot to the provided value,
or throws an error if it's readonly. The stack should not be modified either way.

## reference

### `ObjectPropertyReference`
Represents a slot that can be assigned to
*extends `Reference`*
```ts
constructor(type: AccessType, obj: any, name: PropertyKey): ObjectPropertyReference
```
**Properties:**
- `obj: any`
- `name: PropertyKey`
*Inherits 1 properties from `Reference` — see [`Reference`](../reference.md)*
**Methods:**
- `get(vm: JebVM, shouldBind: boolean): any` — Returns the current value, or returns `NOTHING` and throws an error (in the VM, not Javascript) if it's not readable.
- `set(vm: JebVM, value: any): void` — Set the value of the slot to the provided value,
or throws an error if it's readonly. The stack should not be modified either way.

### `VariableReference`
Represents a slot that can be assigned to
*extends `Reference`*
```ts
constructor(type: AccessType, env: Env, name: Identifier): VariableReference
```
**Properties:**
- `notFoundMessage: string`
- `env: Env`
- `name: Identifier`
*Inherits 1 properties from `Reference` — see [`Reference`](../reference.md)*
**Methods:**
- `get(): any` — Returns the current value, or returns `NOTHING` and throws an error (in the VM, not Javascript) if it's not readable.
- `set(vm: JebVM, value: any, create: boolean, readonly: boolean): void` — Set the value of the slot to the provided value,
or throws an error if it's readonly. The stack should not be modified either way.

## vm

### `JebVM`
Base VM for running JEB code
*extends `EventDispatcher<JEBAuditEvents>`*
```ts
constructor<T>(): JebVM<T>
```
**Properties:**
- `currentEnv: Env` — current environment
- `commandStack: LinkedList<Command<T>>` — stack of commands to execute
- `dataStack: LinkedList<any>` — stack of values
- `curDynamicWind: DynamicWind<T>` — current dynamic wind stack (linked list / tree)
- `paused: boolean` — whether the VM is paused
- `awaiting: Promise<void> | null` — the Promise that the VM is currently waiting on
- `tracebackStack: LinkedList<StackCount>` — callstack entries
- `builtinsEnv: Env` — Environment that all builtins live in
- `protocols: Partial<JEBProtocols<T>>`
**Methods:**
- `getState(): any`
- `restoreState(state: any): void`
- `addProtocol<N>(name: N, impl: JEBProtocols<T>[N][number]): void`
- `getProtocol<N, A>(fast: boolean, assert: A, name: N, args: Tuple<any, ArgcForName<T, N>>): JEBProtocols<T>[N][number] | (A extends true ? never : undefined)`
- `pushData(value: any): void`
- `popNData(n: number): any[]`
- `popData(): any`
- `peekData(): any`
- `pushCommand<TOpcode>(f: TOpcode, args: GetArgParams<TOpcode>): void`
- `popCommand(): Command<T>`
- `step(): boolean` — Runs one opcode.
- `start(code: any): void` — Starts running the code
- `reset(): void` — Silently stops running the code, by resetting all stacks state back to the initial empty state.
Does not clear the builtins env.
- `checkRecursion(length: number): void` — If the recursionDepth is larger than the given length, adds an error to the command stack
to signal to the running program that it's recursing too much
- `tracebackArray(numToDrop: number): StackTreeNode[]` — Returns the names of the functions in the call stack, with innermost first
- `pushTraceback(func: Identifier | undefined, tailcallHint: boolean, callsiteLocation: Location | undefined): void` — Adds a function call entry to the traceback stack
- `popTraceback(dropTail: boolean): void` — Drops all the tail-call entries off the stack, and then one more
- `newDynamicWind(): DynamicWind<T>`
- `createEnv(parents: Env[]): Env`
- `cc(extraOps: Command<T>[]): Continuation<T>` — Returns the current continuation at this state.
- `fatalError(error: JEBError): never`

## wrapper

### `Wrapper`
Represents a wrapped value that only appears as a directly-usable value under certain circumstances
```ts
constructor(obj: any): Wrapper
```
**Properties:**
- `flag: string`
- `obj: any`

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

### `ReferenceWrapper`
Wrapper for a variable reference
*extends `Wrapper`*
```ts
constructor(obj: any): ReferenceWrapper
```
*Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)*

### `MacroWrapper`
Wrapper for a macro result
*extends `Wrapper`*
```ts
constructor(obj: any): MacroWrapper
```
*Inherits 2 properties from `Wrapper` — see [`Wrapper`](../wrapper.md)*
