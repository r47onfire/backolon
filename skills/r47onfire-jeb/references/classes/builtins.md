# Classes

## builtins

### `ObjectPropertyReference`
A reference to a property of a plain JavaScript object (host-language
interop). Reads and writes also emit audit events, since they reach
outside the JEB runtime.
*extends `Reference`*
```ts
constructor(type: AccessType, obj: any, name: PropertyKey): ObjectPropertyReference
```
**Properties:**
- `obj: any`
- `name: PropertyKey`
- `type: AccessType`
**Methods:**
- `get(vm: JebVM, shouldBind: boolean): any` — Reads the property. If `shouldBind` is set and the value is a function,
it is bound to the object, so host methods keep their receiver.
- `set(vm: JebVM, value: any): void` — Writes the property, converting any JavaScript exception thrown by a
setter into a JEB error.

### `VariableReference`
A reference to a variable in an Env. The access type decides both
how the reference behaves and the wording of the error reported when the
variable does not exist (variable, function call target, or module
property).
*extends `Reference`*
```ts
constructor(type: AccessType, env: Env, name: Identifier): VariableReference
```
**Properties:**
- `notFoundMessage: string` — Message of the error thrown when the variable cannot be found
- `env: Env`
- `name: Identifier`
- `type: AccessType`
**Methods:**
- `get(): any` — Returns the variable's current value, or throws if it is not defined
in the environment or any of its parents.
- `set(vm: JebVM, value: any, create: boolean, readonly: boolean): void` — Assigns the variable. With `create`, the binding is defined directly in
this reference's environment (as a constant if `readonly`); otherwise
the assignment lands in whichever environment defines the variable,
throwing if there is none or it is a constant, and runs that variable's
watchers. Either way, a successful assignment invokes the `name`
protocol on the new value.
- `referenceError(): never` — Throws the "not found" error for this reference.
