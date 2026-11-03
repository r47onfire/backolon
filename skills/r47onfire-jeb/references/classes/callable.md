# Classes

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
- `__new__(args: any[]): any` — Called when the object is invoked as a class constructor (i.e. `new
this(...)`)

### `JSFun`
Wrapper for a Javascript function that can be called by the JEB runtime. The
Javascript function has access to the VM so it can push opcodes to implement
more than just computation.
*implements `HasDocstring`, `ApplyMetadata`*
```ts
constructor<T, S>(name: Identifier, signature: S, impl: (args: { [P in LonghandArgument<any, any> as P["name"]]: P extends LonghandArgument<any, 0> ? unknown[] : P extends LonghandArgument<any, 1> ? Record<PropertyKey, unknown> : unknown } & { [ARGUMENT_LOCATIONS]: Record<S[number]["name"], Location | undefined> }, vm: T, location: Location | undefined) => any, doc: string): JSFun<T, S>
```
**Properties:**
- `name: Identifier` — The name of the function as it should appear in a traceback.
- `signature: S` — The declared parameter signature the runtime binds call arguments
against (see `doargs`).
- `impl: (args: { [P in LonghandArgument<any, any> as P["name"]]: P extends LonghandArgument<any, 0> ? unknown[] : P extends LonghandArgument<any, 1> ? Record<PropertyKey, unknown> : unknown } & { [ARGUMENT_LOCATIONS]: Record<S[number]["name"], Location | undefined> }, vm: T, location: Location | undefined) => any` — The javascript function implementation.

If the function returns the special value NOTHING, no value
will be pushed as the result of the function call. Otherwise, the
return value is pushed (even if it's `undefined`).
- `doc: string` — The docstring given - should define the allowable syntax(es) of the
function or macro and give a description of its behavior.

### `Fun`
A Fun is a callable function or macro implemented as JEB code instead of a
Javascript function.
*extends `CallableClass`*
*implements `HasDocstring`, `ApplyMetadata`*
```ts
constructor<S>(isImplicit: boolean, name: Identifier | undefined, signature: S, body: Block, doc: string): Fun<S>
```
**Properties:**
- `isImplicit: boolean` — Whether the function should be hidden from stack traces.
- `name: Identifier | undefined` — The name of the function as it should appear in a traceback. Ignored
if isImplicit=true
- `signature: S` — The declared parameter signature the runtime binds call arguments
against (see `doargs`).
- `body: Block` — The body code that will be evaluated in the new scope with the
argument values bound.
- `doc: string` — The docstring given - should define the allowable syntax(es) of the
function or macro and give a description of its behavior.
**Methods:**
- `__call__(): never` — JEB lambdas are currently not callable via javascript.
- `__new__(): never` — JEB lambda are not class constructors.
