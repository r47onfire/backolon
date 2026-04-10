# Types & Enums

## Types

### `JSObjectRef`
Internal wrapper for native JavaScript objects stored in Backolon values.

### `CheckedType`
```ts
T extends (thing: Thing<any>) => thing is Thing<infer U> ? U : never
```

### `Token`
```ts
OneTypeThing<typeof TOKENIZE_RULES[number][1] | end>
```

### `StackEntry`
A single stack frame in the Backolon evaluator.

## Enums

### `ThingType`
- `nil` = `0` — the empty value
- `end` = `1` — represents the end-of-file marker for tokenization, or the end of a read stream, or the end of an iterable
- `name` = `2` — an alphanumeric symbol, such as x, hello, or _QWE_RTY_123
- `operator` = `3` — an operator character (only ever one character)
- `space` = `4` — a symbol composed entirely of whitespace and/or comments. Newlines get their own Thing.
- `newline` = `5` — 
- `number` = `6` — 
- `string` = `7` — 
- `roundblock` = `8` — 
- `squareblock` = `9` — 
- `curlyblock` = `10` — 
- `topblock` = `11` — 
- `stringblock` = `12` — 
- `apply` = `13` — represents a function call, children[0] is the function, children[1:] are the arguments
- `func` = `14` — closed-over lambda function or macro, children[0] is the call signature, children[1] is the body
- `nativefunc` = `15` — javascript function or macro, children is empty, value is the native function details
- `implicitfunc` = `16` — implicit block, value=env, children[0] is the body
- `paramdescriptor` = `17` — name, type, default; value=lazy
- `continuation` = `18` — 
- `boundmethod` = `19` — children[0] is the bind target object (the "self" value), children[1] is the method
- `pattern` = `20` — pattern program in data, child nodes are just for reconstruction
- `list` = `21` — 
- `map` = `22` — 
- `pair` = `23` — 
- `pattern_entry` = `24` — 
- `env` = `25` — triple (parent or nil, vars, patterns); patterns is list of (pattern, when, implementation)
- `macroized` = `26` — 
- `splat` = `27` — 

### `StackFlag`
Flags used to record internal task evaluation state.
- `native_func_being_evaluated` = `1` — 
