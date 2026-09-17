# Variables & Constants

## builtins

### `OP_audit`
```ts
const OP_audit: (vm: JebVM, args: [any, ...unknown[]]) => void
```

### `B_audit`
```ts
const B_audit: JSFun<JebVM<any>, CallableSignatureFromShorthand<["event", "params", true]>>
```

### `OP_tbPop`
```ts
const OP_tbPop: (vm: any) => any
```

### `OP_tbPush`
```ts
const OP_tbPush: (vm: JebVM, __namedParameters: [f: Identifier, Location | undefined, tail?: boolean]) => void
```

### `OP_shuffle`
```ts
const OP_shuffle: (vm: JebVM, __namedParameters: [number, number[]]) => void
```

### `OP_eval`
```ts
const OP_eval: (vm: JebVM, __namedParameters: [Location | undefined, tail?: boolean]) => void
```

### `B_eval`
```ts
const B_eval: JSFun<JebVM<any>, CallableSignatureFromShorthand<["arg"]>>
```

### `B_macro_wrap`
```ts
const B_macro_wrap: JSFun<JebVM<any>, CallableSignatureFromShorthand<["code"]>>
```

### `OP_apply`
```ts
const OP_apply: (vm: JebVM, __namedParameters: [any[], location?: Location, tail?: boolean, noEval?: boolean]) => void
```

### `B_atLocation`
```ts
const B_atLocation: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly [true, "pos"], readonly [true, "expr"]]>>
```

### `B_splat`
```ts
const B_splat: JSFun<JebVM<any>, CallableSignatureFromShorthand<["value", readonly ["kw", false]]>>
```

### `B_keyword`
```ts
const B_keyword: JSFun<JebVM<any>, CallableSignatureFromShorthand<["name", "value"]>>
```

### `OP_index`
```ts
const OP_index: (vm: JebVM, __namedParameters: [AccessType]) => void
```

### `OP_get`
```ts
const OP_get: (vm: JebVM, __namedParameters: [boolean]) => void
```

### `OP_set`
```ts
const OP_set: (vm: JebVM, __namedParameters: [create?: boolean, readonly_?: boolean]) => void
```

### `B_dot`
```ts
const B_dot: JSFun<JebVM<any>, CallableSignatureFromShorthand<["obj", "name"]>>
```

### `B_set`
```ts
const B_set: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly [readonly ["ref"], "ref"], readonly [false, "value"], readonly ["old", false]]>>
```

### `OP_throw`
```ts
const OP_throw: (vm: JebVM, __namedParameters: [JEBError]) => void
```

### `B_throw`
```ts
const B_throw: JSFun<JebVM<any>, CallableSignatureFromShorthand<["err"]>>
```

### `B_err`
```ts
const B_err: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly ["type", "EPANIC"], readonly ["message", "no message"], readonly ["up", 0]]>>
```

### `B_with`
```ts
const B_with: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly [true, "binding"], "context", readonly [false, "body"], true]>>
```

### `B_is_nil`
```ts
const B_is_nil: JSFun<JebVM<any>, CallableSignatureFromShorthand<["value"]>>
```

### `OP_set_env`
```ts
const OP_set_env: (vm: JebVM, __namedParameters: [Env]) => Env
```

### `OP_if`
```ts
const OP_if: (vm: T, __namedParameters: [any, any, asm?: false] | [Command<T> | null, Command<T> | null, true]) => void
```

### `B_if`
```ts
const B_if: JSFun<JebVM<any>, CallableSignatureFromShorthand<["condition", readonly [true, "then"], readonly [true, "else", null]]>>
```

### `B_begin`
```ts
const B_begin: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly [true, "body"], true]>>
```

### `B_let`
```ts
const B_let: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly [true, "__args"], true]>>
```

### `B_let_in`
```ts
const B_let_in: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly [true, "pairs"], true]>>
```

### `B_define`
```ts
const B_define: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly [true, "definition"], true]>>
```

### `B_plus`
```ts
const B_plus: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a", readonly ["b", typeof NOTHING]]>>
```

### `B_minus`
```ts
const B_minus: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a", readonly ["b", typeof NOTHING]]>>
```

### `B_mul`
```ts
const B_mul: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a", readonly ["b", typeof NOTHING]]>>
```

### `B_div`
```ts
const B_div: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a", readonly ["b", typeof NOTHING]]>>
```

### `B_mod`
```ts
const B_mod: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a", readonly ["b", typeof NOTHING]]>>
```

### `B_pow`
```ts
const B_pow: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a", readonly ["b", typeof NOTHING]]>>
```

### `B_bitAnd`
```ts
const B_bitAnd: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a", readonly ["b", typeof NOTHING]]>>
```

### `B_bitOr`
```ts
const B_bitOr: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a", readonly ["b", typeof NOTHING]]>>
```

### `B_bitXor`
```ts
const B_bitXor: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a", readonly ["b", typeof NOTHING]]>>
```

### `B_bitInv`
```ts
const B_bitInv: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a"]>>
```

### `B_eq`
```ts
const B_eq: JSFun<JebVM<any>, CallableSignatureFromShorthand<["items", true]>>
```

### `B_not_eq`
```ts
const B_not_eq: JSFun<JebVM<any>, CallableSignatureFromShorthand<["items", true]>>
```

### `B_less`
```ts
const B_less: JSFun<JebVM<any>, CallableSignatureFromShorthand<["items", true]>>
```

### `B_greater`
```ts
const B_greater: JSFun<JebVM<any>, CallableSignatureFromShorthand<["items", true]>>
```

### `B_less_eq`
```ts
const B_less_eq: JSFun<JebVM<any>, CallableSignatureFromShorthand<["items", true]>>
```

### `B_greater_eq`
```ts
const B_greater_eq: JSFun<JebVM<any>, CallableSignatureFromShorthand<["items", true]>>
```

### `B_not`
```ts
const B_not: JSFun<JebVM<any>, CallableSignatureFromShorthand<["value"]>>
```

### `B_and_shortcircuit`
```ts
const B_and_shortcircuit: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a", readonly [true, "b"]]>>
```

### `B_or_shortcircuit`
```ts
const B_or_shortcircuit: JSFun<JebVM<any>, CallableSignatureFromShorthand<["a", readonly [true, "b"]]>>
```

### `B_list`
```ts
const B_list: JSFun<JebVM<any>, CallableSignatureFromShorthand<["values", true]>>
```

### `B_head`
```ts
const B_head: JSFun<JebVM<any>, CallableSignatureFromShorthand<["list"]>>
```

### `B_tail`
```ts
const B_tail: JSFun<JebVM<any>, CallableSignatureFromShorthand<["list"]>>
```

### `B_concat`
```ts
const B_concat: JSFun<JebVM<any>, CallableSignatureFromShorthand<["lists", true]>>
```

### `B_quote`
```ts
const B_quote: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly [true, "expr"]]>>
```

### `B_quasiquote`
```ts
const B_quasiquote: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly [true, "value"]]>>
```

### `B_unquote`
```ts
const B_unquote: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly [true, "value"]]>>
```

### `B_unquoteSplicing`
```ts
const B_unquoteSplicing: JSFun<JebVM<any>, CallableSignatureFromShorthand<[readonly [true, "value"]]>>
```

### `B_jsonparse`
```ts
const B_jsonparse: JSFun<JebVM<any>, CallableSignatureFromShorthand<["json"]>>
```

### `B_jsonstringify`
```ts
const B_jsonstringify: JSFun<JebVM<any>, CallableSignatureFromShorthand<["value"]>>
```

## define

### `ALL_OPCODES`
```ts
const ALL_OPCODES: Record<string, [fn: OpcodeFunction<any, any>, doc: string | null]>
```

### `NOTHING`
Special symbol to represent 'no value' in contexts where `undefined` is a valid value.
```ts
const NOTHING: typeof NOTHING
```

## errno

### `ErrnoDesc`
Errno database mapping E-code to string description default
```ts
const ErrnoDesc: Record<ErrnoCode, string>
```

## errnoInheritance

### `ErrnoParent`
```ts
const ErrnoParent: Record<ErrnoCode, ErrnoCode[] | undefined>
```

## protocol

### `typecheck`
```ts
const typecheck: (x: unknown, t: T, paramName?: string) => asserts x is TypeValue<T[number]>
```

## math

### `float`
```ts
const float: NumberConstructor
```

### `int`
```ts
const int: BigIntConstructor
```
