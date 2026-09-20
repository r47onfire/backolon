# Types & Enums

## auditHookTypes

### `JEBAuditEvents`
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
**Properties:**
- `return: Continuation<any>` (optional)

### `Location`
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

### `TypeValue`
```ts
T extends true ? any : T extends keyof TypeMap ? TypeMap[T] : T extends (args: any[]) => infer U ? U : never
```

### `TypeArrayValue`
```ts
number extends T["length"] ? TypeValue<T[number][number]> : T extends [...(infer Head extends Type[][]), infer Tail extends Type[]] ? [...TypeArrayValue<Head, D>, Head["length"] extends keyof D ? D[Head["length"]] : TypeValue<Tail[number]>] : []
```

### `BaseProtocolObj`
**Properties:**
- `type: T` — The type specialization that this protocol works with.
- `doc: string` — Documentation string for this protocol implementation.

### `DescribedProtocolObj`
**Properties:**
- `type: T` — The type specialization that this protocol works with.
- `doc: string` — Documentation string for this protocol implementation.

### `ProtocolObj`
```ts
I extends void ? BaseProtocolObj<V, R, T, D, F> : DescribedProtocolObj<V, R, T, D, I, F>
```

### `ProtocolsList`
```ts
ProtocolObj<V, R, T, D, I, F>[]
```

### `BinaryProtocolToResult`
```ts
ProtocolsList<V, Result<any, string>, [Type[], Type[]], {}, void, void>
```

### `UnaryProtocolToResult`
```ts
ProtocolsList<V, Result<any, string>, [Type[]], {}, void, void>
```

### `ApplyMetadata`
**Properties:**
- `name: Identifier | undefined` — The name of the function to appear in tracebacks, if undefined it means it's a hidden callframe and won't show.
- `signature: CallableSignature`
- `closureEnv: Env` (optional) — The environment(s) that this function closes over on order to allow default value expressions to be evaluated in that environment.

### `ApplyFlags`
**Properties:**
- `tail: boolean`
- `location: Location | undefined`

### `EvalFlags`
**Properties:**
- `tail: boolean`
- `location: Location | undefined`

### `AccessFlags`
**Properties:**
- `field: PropertyKey`
- `type: AccessType`

### `JEBProtocols`
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
```ts
JEBProtocols<V>[N] extends ProtocolsList<V, any, infer N, any, any> ? N["length"] : number
```

### `ResultForName`
```ts
JEBProtocols<V>[N] extends ProtocolsList<V, infer N, any, any, any> ? N : unknown
```

### `FlagsForName`
```ts
JEBProtocols<V>[N] extends ProtocolsList<V, any, any, any, any, infer N> ? N : []
```

### `InfoForName`
```ts
JEBProtocols<V>[N] extends ProtocolsList<V, any, any, any, any, infer N> ? N : never
```

### `FnTypeForName`
```ts
JEBProtocols<V>[N][number]["run"]
```

### `AccessType`
- `VARIABLE` = `0`
- `FUNCTION` = `1`
- `PROPERTY` = `2`

## signature

### `ShorthandArgument`
```ts
N | readonly [name: N, defaultExpr: any] | readonly [lazy: false, name: N] | readonly [macro: true, name: N] | readonly [flags: F, name: N] | readonly [flags: F, name: N, defaultExpr: any] | readonly [flags: F, lazy: false, name: N] | true | false
```

### `LonghandArgument`
**Properties:**
- `name: N`
- `required: boolean`
- `defaultExpr: any`
- `lazy: Laziness`
- `flags: F`

### `ShorthandToLonghand`
```ts
S extends readonly [ShorthandArgument<any, any>, boolean, ...(infer T extends readonly any[])] ? ShorthandToLonghand<T> : S extends readonly [ShorthandArgument<infer N, infer F>, ...(infer T extends readonly any[])] ? [LonghandArgument<N, F>, ...ShorthandToLonghand<T>] : readonly []
```

### `ExtractRest`
```ts
S extends readonly [ShorthandArgument<infer N, infer F>, B, ...readonly any[]] ? LonghandArgument<N, F> : S extends readonly [any, ...(infer R extends readonly ShorthandArgument<any, any>[])] ? ExtractRest<R, B> : undefined
```

### `CallableSignature`
**Properties:**
- `params: P`
- `rest: R`
- `kwRest: K`

### `CallableSignatureFromShorthand`
```ts
CallableSignature<ShorthandToLonghand<S>, ExtractRest<S, true>, ExtractRest<S, false>>
```

### `Laziness`
- `NONE` = `0`
- `LAZY` = `1`
- `QUOTED` = `2`

## utils

### `Tuple`
```ts
N extends N ? number extends N ? T[] : _TupleOf<T, N, []> : never
```

### `Writable`
```ts
{ -readonly [P in keyof T]: T[P] }
```

### `DropFirst`
```ts
T extends [any, ...(infer Rest)] ? Rest : []
```

### `Identifier`
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
**Properties:**
- `name: Identifier | undefined`
- `location: Location | undefined`
- `count: number`
- `tail: boolean`

### `OpcodeFunction`
Function that implements an opcode for the VM by pushing instructions or pushing and popping data.
```ts
(vm: U, args: T) => void
```

### `GetArgParams`
```ts
Parameters<T>[1] extends infer T extends any[] ? T : [void]
```

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
- `ETOOMANYREFS` = `59` — Too many references: can't splice
- `ETIMEDOUT` = `60` — Operation timed out
- `ECONNREFUSED` = `61` — Connection refused
- `ELOOP` = `62` — Too many levels of symbolic links
- `ENAMETOOLONG` = `63` — File name too long
- `EHOSTDOWN` = `64` — Host is down
- `EHOSTUNREACH` = `65` — No route to host
- `ENOTEMPTY` = `66` — Directory not empty
- `EPROCLIM` = `67` — Too many processes
- `EUSERS` = `68` — Too many users
- `EDQUOT` = `69` — Disc quota exceeded
- `ESTALE` = `70` — Stale NFS file handle
- `EREMOTE` = `71` — Too many levels of remote in path
- `EBADRPC` = `72` — RPC struct is bad
- `ERPCMISMATCH` = `73` — RPC version wrong
- `EPROGUNAVAIL` = `74` — RPC prog. not avail
- `EPROGMISMATCH` = `75` — Program version wrong
- `EPROCUNAVAIL` = `76` — Bad procedure for program
- `ENOLCK` = `77` — No locks available
- `ENOSYS` = `78` — Function not implemented
- `EFTYPE` = `79` — Inappropriate file type or format
- `EAUTH` = `80` — Authentication error
- `ENEEDAUTH` = `81` — Need authenticator
- `EPWROFF` = `82` — Device power is off
- `EDEVERR` = `83` — Device error, e.g. paper out
- `EOVERFLOW` = `84` — Value too large to be stored in data type
- `EBADEXEC` = `85` — Bad executable
- `EBADARCH` = `86` — Bad CPU type in executable
- `ESHLIBVERS` = `87` — Shared library version mismatch
- `EBADMACHO` = `88` — Malformed Macho file
- `ECANCELED` = `89` — Operation canceled
- `EIDRM` = `90` — Identifier removed
- `ENOMSG` = `91` — No message of desired type
- `EILSEQ` = `92` — Illegal byte sequence
- `ENOATTR` = `93` — Attribute not found
- `EBADMSG` = `94` — Bad message
- `EMULTIHOP` = `95` — Reserved
- `ENODATA` = `96` — No message available on STREAM
- `ENOLINK` = `97` — Reserved
- `ENOSR` = `98` — No STREAM resources
- `ENOSTR` = `99` — Not a STREAM
- `EPROTO` = `100` — Protocol error
- `ETIME` = `101` — STREAM ioctl timeout
- `EOPNOTSUPP` = `102` — Operation not supported on socket
- `ENOPOLICY` = `103` — No such policy registered
- `ENOTRECOVERABLE` = `104` — State not recoverable
- `EOWNERDEAD` = `105` — Previous owner died
- `EQFULL` = `106` — Interface output queue is full
- `ENOTCAPABLE` = `107` — Capabilities insufficient
