# Classes

## protocol

### `Reference`

Represents a slot that can be assigned to

```ts
constructor(type: AccessType): Reference
```

**Properties:**

- `type: AccessType`
  **Methods:**
- `get(vm: JebVM, shouldBind: boolean): any` — Returns the current value, or returns `NOTHING` and throws an error (in the VM, not Javascript) if it's not readable.
- `set(vm: JebVM, value: any, createIfNotFound: boolean, makeConstant: boolean): void` — Set the value of the slot to the provided value,
  or throws an error if it's readonly. The stack should not be modified either way.
