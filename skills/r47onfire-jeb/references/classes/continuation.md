# Classes

## continuation

### `Continuation`
A continuation which holds all the VM state, and can restore it at any time
```ts
constructor<T>(vm: T, extraOps: [opcode: OpcodeFunction<any[], T>, ...immediateArgs: any[]][]): Continuation<T>
```
**Properties:**
- `env: Env` — Closed-over environment
- `commands: LinkedList<[opcode: OpcodeFunction<any[], T>, ...immediateArgs: any[]]>` — Closed-over command stack in progress
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
- `handler: Windable | null` — The enter/exit handler pair for this node; null until setHandler is called
- `envHere: Env` — current env at the point of the dynamic wind start
- `parent: DynamicWind<T> | null` — The enclosing dynamic-wind node, forming the tree that jumps are resolved against
- `commandsHere: LinkedList<[opcode: OpcodeFunction<any[], T>, ...immediateArgs: any[]]>` — closed-over command stack
- `dataHere: LinkedList<any>` — closed-over data stack
- `stateHere: ReturnType<T["getState"]>` — Other saved state
**Methods:**
- `setHandler(handler: Windable): void` — sets the handler after it has been processed
- `processJumpHere(vm: T): void` — processes the jump here, and adds instructions to call the enter and exit handlers
- `restore(vm: T): void` — Restores the dynamic wind state when an error occurs
