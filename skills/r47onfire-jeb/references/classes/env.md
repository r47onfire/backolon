# Classes

## env

### `Env`

Key-value store for managing an environment, with inheritance from parent environments.

```ts
constructor(bindings: Record<Identifier, any>, parents: readonly Env[]): Env
```

**Properties:**

- `constants: Record<Identifier, true>` — Names defined as constants in this scope; set refuses to change them
- `watchers: Record<Identifier, RemovableSet<Block>>` — Handler blocks registered with watch, by variable name. The
  handlers run (in the environment where the variable lives) whenever the
  variable is assigned.
- `bindings: Record<Identifier, any>` — The bindings defined directly in this scope
- `parents: readonly Env[]` — Parent environments searched after this one, in order
  **Methods:**
- `scopeFor(name: Identifier): Result<Env, void>` — Returns the Env in which the given variable is defined.
- `watch(name: Identifier, handler: Block): () => void` — Registers a handler block to be run whenever the named variable is
  assigned in this environment (reactive `always`-style watchers).
  Returns a handle that removes the watcher when called.
- `get(name: Identifier): Result<any, void>` — Look up the value, and return its value (in an ok result)
  or an err result if not found
- `add(name: Identifier, value: any): void` — Defines the value in this scope (always succeeds).
  Note: bailing on trying to reassign a constant is not checked here.
- `addConst(name: Identifier, value: any): void` — Defines the constant in this scope (always succeeds).
  Note: bailing on trying to reassign a constant is not checked here.
- `set(name: Identifier, value: any): false | Env | undefined` — Finds the scope in which this value is defined, and sets it there.
  Returns the env it was just set in if it was set, false if it's a constant and can't be changed,
  or undefined if it wasn't defined anywhere.
