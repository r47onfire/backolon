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

### `Command`
```ts
[alternatives, ...number[]] | [dot] | [anchor, start: boolean] | [match_type, value: ThingType] | [match_value, value: Thing] | [capture_group, name: Thing<name>, end: boolean, single: boolean]
```

### `PatternProgram`
```ts
Command[]
```

### `Pattern`
Represents a pattern variant for pattern-matching.

### `ParamDescriptor`
```ts
Thing<paramdescriptor> | Thing<name>
```

### `NativeFunctionDetails`
Shape of native function metadata registered with the Backolon scheduler.

### `StackEntry`
A single stack frame in the Backolon evaluator.

### `CustomApplicator`
Defines what happens when an object of a particular non-builtin type is called as the functor in an apply expression.
See NativeModule#defcall|NativeModule.defcall for details.

### `OperatorOverload`

## Enums

### `ThingType`
- `nil` = `0` — The empty value.
- `end` = `1` — Represents the end-of-file marker for tokenization.
- `name` = `2` — An alphanumeric symbol, such as `x`, `hello`, or `_QWE_RTY_123`.
- `operator` = `3` — An operator character, such as `+`, `@`, or `$`, but never multiple characters
like `+=` or `|>`.
- `space` = `4` — A symbol composed entirely of whitespace (excluding newlines) and/or comments.
- `newline` = `5` — A symbol composed of entirely newlines.
- `number` = `6` — A math number - JS number or bigint.
- `string` = `7` — A string - literal, or part of an interpolation block.
- `roundblock` = `8` — A block of code enclosed in `(...)`.
- `squareblock` = `9` — A block of code enclosed in `[...]`.
- `curlyblock` = `10` — A block of code enclosed in `{...}`.
- `topblock` = `11` — A block of code represented as written at the top-level of a file.
- `stringblock` = `12` — A string with interpolations, the literal bits are string children,
and the interpolated blocks are included as roundblock blocks
(even though they're written as `{...}`).
- `apply` = `13` — Represents an unevaluated function call, `.c[0]` is the function, `.c[1:]`
are the code blocks that evaluate to the arguments.
- `func` = `14` — A closed-over lambda function or macro, `.c[0]` is the call signature,
`.c[1]` is the body.
- `nativefunc` = `15` — A named javascript function or macro. The value is only the string name
that it's stored under in the Scheduler, so as to allow the
state to be serialized (since JSON can't serialize functions).
- `implicitfunc` = `16` — An implicit block (what a function gets if it declares a parameter as
`@lazy`), `.v` is the closed-over env, `.c[0]` is the actual body.
- `paramdescriptor` = `17` — An entry in a parameter list of a function (e.g. `.c[0]` of a
func); the children are the name name, allowed
types list, and the default value if it's optional.
The value is a 3-tuple of booleans `[lazy, splat, mustUnpack]`.
- `continuation` = `18` — Represents a continuation. The value is a copy of the Task#stack stack
at the point at which it was captured, and invoking the continuation restores
the stack.
- `pattern` = `19` — Represents a parsed pattern, for pattern-matching. The value is
a Pattern.
- `list` = `20` — A list of values. This is **NOT** a list literal - those are a squareblock
and processed by the builtin patterns.
- `map` = `21` — A mapping of keys to values. The children are pair. This is **NOT** a
map literal - those are a squareblock and processed by the builtin patterns.
- `pair` = `22` — A key-value pair in a map. The hash value of this is ignored, since maps are
keyed on the key's hash.
- `pattern_entry` = `23` — An entry of a pattern-matching pattern in the environment's patterns list.
The children are the pattern itself, the callable handler that processes
the match, a list of types specifying which blocks the pattern applies in,
and a number specifying the precedence of the pattern (for sorting, when
defining a new pattern).
- `env` = `24` — Represents an environment that variables and patterns can be stored in.
The children are a list of parent envs or nil if there's no parent,
a map of the variables, and a list of pattern_entry.
- `macroized` = `25` — Returned by a function to signal its result is a macro body, and should be evaluated again.
- `splat` = `26` — Represents a function that should have its return value spliced into the callee's arguments list.

### `PatternType`
- `sequence` = `0` — Sequence of things in order `abcd`
- `alternatives` = `1` — List of options to be matched `{a|b|c|d}`
- `repeat` = `2` — Repeat (one or more) `(a)...`
- `capture_group` = `3` — Capture group into a symbol name `[name(a)]`
- `dot` = `4` — Matches anything as a wildcard. Used for bare names like `x`.
- `anchor` = `5` — Force the match to be at the start `[^]`, or at the end `[$]`.
- `match_type` = `6` — Match a value with a certain ThingType `[:type]`
- `match_value` = `7` — Match that literal value `[=value]`

### `StackFlag`
Flags used to record internal task evaluation state.
- `native_func_being_evaluated` = `1` — Normally, a native function is treated as a value and returned; however,
when one is called it needs to be the StackEntry#value|value of the
StackEntry it's in so that its arguments can be processed. That stack has this
flag set to mark that it's actually being called and not just returned.
