# Types & Enums

## auditHookTypes

### `JEBAuditEvents`
Map of the audit events a JebVM can emit through its event
dispatcher, from event name to payload type. These events mark operations
that are potentially unsafe or reach outside the sandbox (host-language
interop), so an embedding application can hook, log, or veto them.
Additional events may be registered by index signature.
**Properties:**
- `jeb:add_audit_hook: void`
- `jeb:ffi/call_function: [f: Function, args: any[]]`
- `jeb:ffi/object/get: [key: PropertyKey, o: any]`
- `jeb:ffi/object/set: [key: PropertyKey, o: any, value: any]`
- `jeb:loop_check: number`

## continuation

### `Windable`
Data holding a dynamic wind enter/exit handler pair
**Properties:**
- `enter: any`
- `exit: any`

## errors

### `JEBErrorContext`
Arbitrary extra data attached to a JEBError. The `return` key is
special: it holds the restart continuation that error handlers (see `with`)
can invoke to resume execution at the expression that caused the error.
**Properties:**
- `return: Continuation<any>` (optional)

### `Location`
A source location, as an `[id, file]` pair; either entry may be
`undefined` if it is not known.
```ts
[id: number | undefined, file: number | undefined]
```

### `StackTreeNode`
Tree node representing a compressed stack trace
```ts
Readonly<{ leaf: false; count: number; children: StackTreeNode[]; hash: number } | { leaf: true; name: Identifier | undefined; location: Location | undefined; hash: number }>
```

## math

### `BinaryFun`
A function taking two arguments
```ts
(a: any, b: any) => any
```

### `Relation`
The value is a bit field: equal is 4, less is 2, greater is 1
- `FALSE` = `0`
- `GREATER` = `1`
- `LESS` = `2`
- `NOT_EQ` = `3`
- `EQUAL` = `4`
- `GREATER_EQ` = `5`
- `LESS_EQ` = `6`
- `TRUE` = `7`

## protocol

### `Type`
Thing that can be used to match a type of an object. `true` = any
```ts
((args: any[]) => any) | keyof TypeMap | true
```

### `TypeMap`
Maps the string type specifiers of Type to the Typescript types they match.

### `TypeValue`
The Typescript type of the values matched by the Type specifier `T`.
```ts
T extends true ? any : T extends keyof TypeMap ? TypeMap[T] : T extends (args: any[]) => infer U ? U : never
```

### `TypeArrayValue`
Maps a list of per-argument Type unions to the tuple type of the
argument values. `D` may override the value type of individual positions
(keyed by argument index) for arguments whose value differs from the type
they were checked against.
```ts
number extends T["length"] ? TypeValue<T[number][number]> : T extends [...(infer Head extends Type[][]), infer Tail extends Type[]] ? [...TypeArrayValue<Head, D>, Head["length"] extends keyof D ? D[Head["length"]] : TypeValue<Tail[number]>] : []
```

### `BaseProtocolObj`
A single implementation of a protocol: the argument type specialization it
handles, the code to run for it, and its documentation string.
**Properties:**
- `type: T` — The type specialization that this protocol works with.
- `doc: string` — Documentation string for this protocol implementation.

### `DescribedProtocolObj`
A BaseProtocolObj that can also describe its first argument,
yielding metadata (`I`) about it, such as a callable's signature.
**Properties:**
- `type: T` — The type specialization that this protocol works with.
- `doc: string` — Documentation string for this protocol implementation.

### `ProtocolObj`
A protocol implementation object: a DescribedProtocolObj if the
protocol has a metadata type `I`, otherwise a plain BaseProtocolObj.
```ts
I extends void ? BaseProtocolObj<V, R, T, D, F> : DescribedProtocolObj<V, R, T, D, I, F>
```

### `ProtocolsList`
All registered implementations of one protocol. When the protocol is
invoked, the best-matching implementation is chosen (see
getProtocolHandler).
```ts
ProtocolObj<V, R, T, D, I, F>[]
```

### `BinaryProtocolToResult`
A protocol taking two arguments and returning a `Result` (the binary math protocols).
```ts
ProtocolsList<V, Result<any, string>, [Type[], Type[]], {}, void, void>
```

### `UnaryProtocolToResult`
A protocol taking one argument and returning a `Result` (the unary math protocols).
```ts
ProtocolsList<V, Result<any, string>, [Type[]], {}, void, void>
```

### `ApplyMetadata`
Metadata describing a callable, returned by the `apply` protocol's `describe`.
**Properties:**
- `name: Identifier | undefined` — The name of the function to appear in tracebacks, if undefined it means it's a hidden callframe and won't show.
- `signature: CallableSignature` — The callable's parameter signature, used to process its arguments.
- `closureEnv: Env` (optional) — The environment(s) that this function closes over on order to allow default value expressions to be evaluated in that environment.

### `ApplyFlags`
Flags passed to an `apply` protocol implementation for a single call.
**Properties:**
- `tail: boolean` — Whether the call is in tail position.
- `location: Location | undefined` — Source location of the call site, for tracebacks.

### `EvalFlags`
Flags passed to an `eval` protocol implementation for a single evaluation.
**Properties:**
- `tail: boolean` — Whether the evaluation is in tail position.
- `location: Location | undefined` — Source location of the expression being evaluated, for tracebacks.

### `AccessFlags`
Flags passed to an `access` protocol implementation: which field of the
object to access, and in what capacity.
**Properties:**
- `field: PropertyKey` — The field (variable name, property key, ...) being accessed.
- `type: AccessType` — The capacity in which the field is accessed.

### `JEBProtocols`
The protocol registry of a VM: maps each protocol name to the list of its
registered implementations. The runtime protocols (`apply`, `eval`,
`access`, `unwrap`, `name`) drive evaluation; the rest implement the
overloadable math operations.
**Properties:**
- `apply: ProtocolsList<V, void, [Type[]], {}, ApplyMetadata, ApplyFlags>`
- `eval: ProtocolsList<V, void, [Type[]], {}, void, EvalFlags>`
- `access: ProtocolsList<V, typeof NOTHING | Reference, [Type[]], {}, void, AccessFlags>`
- `unwrap: ProtocolsList<V, void, [typeof Wrapper[]], {}, void, void>`
- `name: ProtocolsList<V, void, [Type[]], {}, void, { name: Identifier }>`
- `add: BinaryProtocolToResult<V>`
- `abs: UnaryProtocolToResult<V>`
- `sub: BinaryProtocolToResult<V>`
- `neg: UnaryProtocolToResult<V>`
- `div: BinaryProtocolToResult<V>`
- `inv: UnaryProtocolToResult<V>`
- `mul: BinaryProtocolToResult<V>`
- `matMul: BinaryProtocolToResult<V>`
- `mod: BinaryProtocolToResult<V>`
- `cmp: ProtocolsList<V, Result<boolean, string>, [Type[], Type[], ["number"]], { 2: Relation }, void, void>`
- `pow: BinaryProtocolToResult<V>`
- `bitAnd: BinaryProtocolToResult<V>`
- `bitOr: BinaryProtocolToResult<V>`
- `bitXor: BinaryProtocolToResult<V>`
- `bitNot: ProtocolsList<V, Result<any, string>>`

### `ArgcForName`
The number of arguments the protocol `N` takes.
```ts
JEBProtocols<V>[N] extends ProtocolsList<V, any, infer N, any, any> ? N["length"] : number
```

### `ResultForName`
The result type of the protocol `N`.
```ts
JEBProtocols<V>[N] extends ProtocolsList<V, infer N, any, any, any> ? N : unknown
```

### `FlagsForName`
The flags type passed to implementations of the protocol `N`.
```ts
JEBProtocols<V>[N] extends ProtocolsList<V, any, any, any, any, infer N> ? N : []
```

### `InfoForName`
The metadata type (`describe` result) of the protocol `N`.
```ts
JEBProtocols<V>[N] extends ProtocolsList<V, any, any, any, any, infer N> ? N : never
```

### `FnTypeForName`
The `run` function type of implementations of the protocol `N`.
```ts
JEBProtocols<V>[N][number]["run"]
```

### `AccessType`
The capacity in which a Reference is accessed.
- `VARIABLE` = `0`
- `FUNCTION` = `1`
- `PROPERTY` = `2`

## signature

### `ShorthandArgument`
Compact form of one parameter in a callable signature. Each union member is
a different parameter flavour (the members are documented individually);
createSignature converts an array of these into the
LonghandArgument form used at runtime. A bare `true`/`false` is not
a parameter itself: it marks the preceding parameter as a rest parameter.
```ts
N | readonly [name: N, defaultExpr: any] | readonly [lazy: false, name: N] | readonly [macro: true, name: N] | readonly [flags: F, name: N] | readonly [flags: F, name: N, defaultExpr: any] | readonly [flags: F, lazy: false, name: N] | true | false
```

### `LonghandArgument`
One parameter of a callable signature, in the expanded form produced by
createSignature and consumed by the argument-processing machinery.
**Properties:**
- `name: N` — The parameter's name.
- `required: boolean` — Whether the caller must supply the argument.
- `defaultExpr: any` — Expression evaluated to produce the value when the argument is not supplied; only meaningful if the parameter is not `required`.
- `lazy: Laziness` — Whether (and how) the argument expression is deferred; see Laziness.
- `flags: F` — Names of wrappers that are *not* unwrapped from this parameter's value, so the body can operate on the wrapper itself.

### `ShorthandToLonghand`
Type-level expansion of a shorthand signature's parameters into
LonghandArguments, dropping the `true`/`false` rest markers.
```ts
S extends readonly [ShorthandArgument<any, any>, boolean, ...(infer T extends readonly any[])] ? ShorthandToLonghand<T> : S extends readonly [ShorthandArgument<infer N, infer F>, ...(infer T extends readonly any[])] ? [LonghandArgument<N, F>, ...ShorthandToLonghand<T>] : readonly []
```

### `ExtractRest`
Type-level extraction of a rest parameter (the parameter followed by `B`:
`true` for the positional rest parameter, `false` for the keyword one)
from a shorthand signature, or `undefined` if there is none.
```ts
S extends readonly [ShorthandArgument<infer N, infer F>, B, ...readonly any[]] ? LonghandArgument<N, F> : S extends readonly [any, ...(infer R extends readonly ShorthandArgument<any, any>[])] ? ExtractRest<R, B> : undefined
```

### `CallableSignature`
The full signature of a callable: its positional parameters plus its
optional rest parameters.
**Properties:**
- `params: P` — The positional parameters, in order.
- `rest: R` — The parameter receiving all remaining positional arguments, if any.
- `kwRest: K` — The parameter receiving all remaining keyword arguments, if any.

### `CallableSignatureFromShorthand`
The CallableSignature that createSignature produces for the
shorthand signature `S`, computed at the type level.
```ts
CallableSignature<ShorthandToLonghand<S>, ExtractRest<S, true>, ExtractRest<S, false>>
```

### `Laziness`
How a parameter's argument expression is treated when the callable is invoked.
- `NONE` = `0` — The argument is evaluated (and unwrapped) before the body runs.
- `LAZY` = `1` — The argument is wrapped in a block without being evaluated.
- `QUOTED` = `2` — The argument is passed as the raw, unevaluated expression.

## utils

### `Tuple`
A tuple of exactly `N` elements of type `T` (or a plain `T[]` when `N` is
a general `number`).
```ts
N extends N ? number extends N ? T[] : _TupleOf<T, N, []> : never
```

### `_TupleOf`
Recursive builder for Tuple: prepends `T` until `R` has `N` elements.
```ts
R["length"] extends N ? R : _TupleOf<T, N, [T, ...R]>
```

### `Writable`
`T` with all `readonly` modifiers removed.
```ts
{ -readonly [P in keyof T]: T[P] }
```

### `DropFirst`
A tuple/array type with its first element removed.
```ts
T extends [any, ...(infer Rest)] ? Rest : []
```

### `Identifier`
A variable name: either a string, or a symbol (as produced by `gensym`).
```ts
string | symbol
```

## vm

### `Command`
Data for the command
```ts
[opcode: OpcodeFunction<any, T>, immediateArgs: any[]]
```

### `StackCount`
One compressed run of call-stack frames: `count` consecutive calls of the
same function at the same call site, collapsed into a single traceback entry.
**Properties:**
- `name: Identifier | undefined` — Name of the function called, if known
- `location: Location | undefined` — Location of the call site
- `count: number` — Number of frames collapsed into this entry
- `tail: boolean` — Whether these frames were entered by tail calls

### `OpcodeFunction`
Function that implements an opcode for the VM by pushing instructions or pushing and popping data.
```ts
(vm: U, args: T) => void
```

### `GetArgParams`
Extracts the type of an opcode function's immediate arguments (everything
after the VM parameter), for typing calls to JebVM.pushCommand.
```ts
Parameters<T>[1] extends infer T extends any[] ? T : [void]
```

## doc

### `HasDocstring`
interface for a thing that has a docstring.
**Properties:**
- `doc: string`

## errno

### `ErrnoCode`
Errno database mapping E-code to value
- `EFAIL` = `0` — Unspecified error
- `ENAME` = `-1` — No such variable
- `EFUNC` = `-2` — No such function
- `ESYNTAX` = `-3` — Unrecognized syntax
- `EJAVASCRIPT` = `-4` — Javascript error
- `EPANIC` = `-255` — Internal error
- `EHTTP` = `1000` — HTTP error
- `EKICKED` = `221` — Bye
- `EBADREQ` = `400` — Bad request
- `EUNAUTH` = `401` — Unauthorized
- `EREFUSED` = `403` — Forbidden
- `ENOTFOUND` = `404` — Not found
- `ETEAPOT` = `418` — I'm a teapot
- `ERATELIMIT` = `429` — Too many requests
- `ELAWYER` = `451` — Unavailable for legal reasons
- `ESERVERERROR` = `500` — Internal server error
- `EUPSTREAM` = `502` — Bad gateway
- `EPROXYWAIT` = `504` — Gateway timeout
- `ELOGIN` = `999` — Request denied
- `EPERM` = `1` — Operation not permitted
- `ENOENT` = `2` — No such file or directory
- `ESRCH` = `3` — No such process
- `EINTR` = `4` — Interrupted system call
- `EIO` = `5` — Input/output error
- `ENXIO` = `6` — Device not configured
- `ENOEXEC` = `8` — Exec format error
- `EBADF` = `9` — Bad file descriptor
- `ECHILD` = `10` — No child processes
- `EDEADLK` = `11` — Resource deadlock avoided
- `ENOMEM` = `12` — Cannot allocate memory
- `EACCES` = `13` — Permission denied
- `EFAULT` = `14` — Bad address
- `ENOTBLK` = `15` — Block device required
- `EBUSY` = `16` — Device / Resource busy
- `EEXIST` = `17` — File exists
- `EXDEV` = `18` — Cross-device link
- `ENODEV` = `19` — Operation not supported by device
- `ENOTDIR` = `20` — Not a directory
- `EISDIR` = `21` — Is a directory
- `EINVAL` = `22` — Invalid argument
- `ENFILE` = `23` — Too many open files in system
- `EMFILE` = `24` — Too many open files
- `ENOTTY` = `25` — Inappropriate ioctl for device
- `ETXTBSY` = `26` — Text file busy
- `EFBIG` = `27` — File too large
- `ENOSPC` = `28` — No space left on device
- `ESPIPE` = `29` — Illegal seek
- `EROFS` = `30` — Read-only file system
- `EMLINK` = `31` — Too many links
- `EPIPE` = `32` — Broken pipe
- `EDOM` = `33` — Numerical argument out of domain
- `ERANGE` = `34` — Result too large
- `EAGAIN` = `35` — Resource temporarily unavailable
- `EINPROGRESS` = `36` — Operation now in progress
- `EALREADY` = `37` — Operation already in progress
- `ENOTSOCK` = `38` — Socket operation on non-socket
- `EDESTADDRREQ` = `39` — Destination address required
- `EMSGSIZE` = `40` — Message too long
- `EPROTOTYPE` = `41` — Protocol wrong type for socket
- `ENOPROTOOPT` = `42` — Protocol not available
- `EPROTONOSUPPORT` = `43` — Protocol not supported
- `ESOCKTNOSUPPORT` = `44` — Socket type not supported
- `ENOTSUP` = `45` — Operation not supported
- `EPFNOSUPPORT` = `46` — Protocol family not supported
- `EAFNOSUPPORT` = `47` — Address family not supported by protocol family
- `EADDRINUSE` = `48` — Address already in use
- `EADDRNOTAVAIL` = `49` — Can't assign requested address
- `ENETDOWN` = `50` — Network is down
- `ENETUNREACH` = `51` — Network is unreachable
- `ENETRESET` = `52` — Network dropped connection on reset
- `ECONNABORTED` = `53` — Software caused connection abort
- `ECONNRESET` = `54` — Connection reset by peer
- `ENOBUFS` = `55` — No buffer space available
- `EISCONN` = `56` — Socket is already connected
- `ENOTCONN` = `57` — Socket is not connected
- `ESHUTDOWN` = `58` — Can't send after socket shutdown

<!-- truncated -->
