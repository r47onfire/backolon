# Classes

## errors

### `JEBError`

Generic base class for an error thrown by a JEB program.
_extends `Error`_

```ts
constructor(code: ErrnoCode, message?: string, options: ErrorOptions & JEBErrorOptions, context: JEBErrorContext, traceback?: StackTreeNode[]): JEBError
```

**Properties:**

- `children: JEBError[]`
- `paramLocation: Location` (optional) — When set, the VM adds a frame for the blamed parameter (named from
  JEBError.paramName) with this location on top of the
  traceback as the traceback is attached, so the error points at the
  specific argument that was bad as well as at the call itself, whose
  frame keeps its own location. Set from
  JEBErrorOptions.paramLocation.
- `paramName: Identifier` (optional) — Name of the parameter blamed by this error, if it blames one.
- `code: ErrnoCode`
- `options: ErrorOptions & JEBErrorOptions`
- `context: JEBErrorContext`
- `traceback: StackTreeNode[]` (optional)
  **Methods:**
- `toString(): string` — Returns a string representation of an object.
