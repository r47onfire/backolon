# Classes

## doargs

### `DoargsState`

Immutable state of one in-progress argument-binding operation (see
OP_doargs). Binding happens one argument at a time and may suspend
to evaluate an argument or a default expression, so the whole process is
captured in this object: each step produces the next state (via `#update`)
instead of mutating in place.

The state tracks the signature being bound (`#params`), the raw given
arguments (`#givenArgs`), the index of the next raw argument
(`#rawArgsIndex`) and of the next parameter to fill (`#paramsIndex`), the
arguments object accumulated so far (`#argsObj`), and which parameters have
already been supplied by name (`#seenByName`). `#callEnv` is the
environment arguments are evaluated in; `#closureEnv` is the callee's
closure environment, additionally visible to default expressions.
In `#noEvalMode`, argument values are taken as-is and lazy parameters are
an error.

`#paramLocations` holds the location of the argument that filled each
parameter, by parameter name, as observed from the VM's last-call slot
when that argument's evaluation returned (see ARGUMENT_LOCATIONS);
it is attached to the finished arguments object and used to blame
binding errors on the offending argument.

```ts
constructor(name: Identifier | undefined, params: readonly LonghandArgument<any, any>[], call: Env, closure: Env | undefined, noEval: boolean, given: any[], argsObj: Record<string, any>, rawArgsIndex: number, paramsIndex: number, seenKeyword: boolean, seenByName: Record<string, DoargsWhere>, paramLocations: Record<Identifier, Location>): DoargsState
```

**Methods:**

- `run(vm: JebVM, first: boolean, argLocation?: Location): void` — Drives the binding loop until it either finishes -- leaving the completed
  arguments object on the data stack -- or suspends by pushing opcodes to
  evaluate the next argument, in which case `OP_doargs_loop` re-enters
  here with `first` false and the evaluated value on the data stack.
