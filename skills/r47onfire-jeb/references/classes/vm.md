# Classes

## vm

### `JebVM`
Base VM for running JEB code
*extends `EventDispatcher<JEBAuditEvents>`*
```ts
constructor<T>(): JebVM<T>
```
**Properties:**
- `currentEnv: Env` — current environment
- `commandStack: LinkedList<[opcode: OpcodeFunction<any[], T>, ...immediateArgs: any[]]>` — stack of commands to execute
- `dataStack: LinkedList<any>` — stack of values
- `curDynamicWind: DynamicWind<T>` — current dynamic wind stack (linked list / tree)
- `paused: boolean` — whether the VM is paused
- `awaiting: Promise<void> | null` — the Promise that the VM is currently waiting on
- `tracebackStack: LinkedList<StackCount>` — callstack entries
- `lastCall: StackEntry | undefined` — The call frame most recently popped by popTraceback: the call
that just returned. Only the single latest frame is kept. Consumers
that run immediately after a call returns (macro expansion, argument
binding) read this to learn which call produced the value at hand.
- `builtinsEnv: Env` — Environment that all builtins live in
- `protocols: Partial<JEBProtocols<T>>` — Protocol implementations registered on this VM, by protocol name
- `error: JEBError | undefined` — The error that stopped the VM, if any; step rethrows it while set
**Methods:**
- `getState(): any` — Hook for VM subclasses with extra state beyond the base stacks: returns a
snapshot of that state, so continuations and dynamic-wind can save and
restore it. The base VM has no extra state.
- `restoreState(state: any): void` — Counterpart to getState: restores a snapshot it returned earlier.
- `addProtocol<N>(name: N, impl: JEBProtocols<T>[N][number]): void` — Registers an implementation of the named protocol. Several
implementations may be registered for one protocol; getProtocol
dispatches between them based on the argument types.
- `getProtocol<N, A>(fast: boolean, assert: A, name: N, args: Tuple<any, ArgcForName<T, N>>): JEBProtocols<T>[N][number] | (A extends true ? never : undefined)` — Finds the implementation of the named protocol to run for the given
arguments: the registered overload whose declared types best match the
arguments' types. With `fast`, the first matching overload (searching
from the most recently registered) wins instead of the best-scoring one.
If `assert` is true, throws when no overload matches.
- `pushData(value: any): void` — Pushes a value onto the data stack.
- `popNData(n: number): any[]` — Pops the top `n` values off the data stack, returned in the order they
were pushed (deepest first).
- `popData(): any` — Pops and returns the top value of the data stack.
- `peekData(): any` — Returns the top value of the data stack without removing it.
- `pushCommand<TOpcode>(f: TOpcode, args: GetArgParams<TOpcode>): void` — Pushes a command (an opcode function plus its immediate arguments) onto
the command stack, to be run by a later step.
- `popCommand(): [opcode: OpcodeFunction<any[], T>, ...immediateArgs: any[]]` — Pops and returns the next command to run. Throws if the command stack
is empty.
- `step(): boolean` — Runs one opcode.
- `start(code: any): void` — Starts running the code
- `reset(): void` — Silently stops running the code, by resetting all stacks state back to the initial empty state.
Does not clear the builtins env.
- `checkRecursion(length: number): void` — If the recursionDepth is larger than the given length, adds an error to the command stack
to signal to the running program that it's recursing too much
- `tracebackArray(numToDrop: number): StackTreeNode[]` — Returns the names of the functions in the call stack, with innermost first
- `pushTraceback(func: Identifier | undefined, tailcallHint: boolean, callsiteLocation: Location | undefined, entryKind: StackEntryKind): void` — Adds a function call entry to the traceback stack
- `popTraceback(dropTail: boolean): void` — Drops all the tail-call entries off the stack, and then one more
- `newDynamicWind(): DynamicWind<T>` — Creates a fresh dynamic-wind node whose parent is the VM's current node.
- `createEnv(parents: Env[]): Env` — Creates a new environment inheriting from the given parent environments.
- `cc(extraOps: [opcode: OpcodeFunction<any[], T>, ...immediateArgs: any[]][]): Continuation<T>` — Returns the current continuation at this state.
