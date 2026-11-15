- `object` - top type - base for all classes - implements the default
  `__getattribute__` and `__hash__` / `__eq__` / `__ne__` / comparison /
  `__bool__` - but not arithmetic values - if object defines `__hash__` method,
  `object.__setattribute__` enforces immutability
    - `type` - base for all metaclasses
        - `singleton` - base for all singleton types. The `__init_subclass__`
          constructs the instance and then sets the class `__instance__` to it;
          then it overrides `__new__` to always just return the `__instance__`
    - `classmethod`
    - `staticmethod`
    - `property`
    - `NoneType` - unit type (metaclass=`singleton`)
        - `NoneHole` - has the hole absorption methods (also subclass of
          `types.Wrapper`)
    - `NotImplementedType` - sentinel to say an overloaded method doesn't apply
      (metaclass=`singleton`)
    - `Ellipsis` - sentinel to say a method didn't return anything at all (not
      even `None`) (metaclass=`singleton`)
    - `EmptyType` - placeholder to signify to argument machinery that default
      value is to be used (metaclass=`singleton`)
    - `DoneType` - sentinel at the end of iterators (metaclass=`singleton`)
    - `types.Number`
        - `int` - wraps JS `BigInt`
            - `bool` - wraps JS `Boolean` - specially returns `True` or `False`
              as a double-singleton thingy
        - `float` - wraps JS `Number`
    - `types.Collection` - abstract class (can't be instantiated)
        - `types.Sequence` - abstract class (can't be instantiated)
            - `str` - wraps JS `String`
            - `tuple` - wraps JS `Array`, but immutable
                - `list` - mutable tuple
            - `bytes` - wraps JS `UInt8Array`
                - `bytearray` - mutable bytes
                    - `memoryview` - wraps JS `DataView`
            - `collections.Stack` - wraps a game-math `LinkedList`
        - `types.KeyedContainer` - abstract class (can't be instantiated)
            - `frozendict` - like a normal dict, but without mutation methods
                - `dict`
                    - `types.Env` - has `__parents__`, a tuple of other Envs
                        - `types.Module` - `__parents__` is empty; also contains
                          `__file__` as both attribute and key
            - `frozenset` - like `frozendict[T, True]`
                - `set`
    - `types.Function` - created by the fn statement; contains `__body__` (a
      `types.Block`), `__signature__` (a `types.Signature`) `__doc__`, and
      `__name__` (both `str`s)
    - `types.BoundFunction` - bound member access
    - `types.BuiltinFunction` - members TBD; `__signature__` (a
      `types.Signature`) `__doc__`, and `__name__` (both `str`s)
    - `types.Wrapper` - abstract class (can't be instantiated)
        - `types.KeywordArg` - wraps a value passed as a keyword argument
        - `types.SplatArg` - wraps an iterable splatted into a call's arguments
        - `types.OptionArg` - wraps a value passed as a command-line-style
          option
        - `types.ReferenceWrapper` - wraps a reference so it can be passed
          around as a value
        - `types.MacroWrapper` - wraps a value passed to a macro unevaluated
        - the empty argument is the `EmptyType` singleton, not a wrapper
    - `types.Signature`
    - `types.Block` - has `__call__` method, `__code__` (a `types.Code`), and
      `__closure__` (a `types.Env`)
    - `types.Code` - wraps a parse tree CST node - readonly struct
    - `types.Location` - a source span: the file it came from, plus start and
      end line/column
    - `types.Continuation` - a captured VM state (data stack, command stack,
      dynamic wind chain, current environment) that can be resumed later

- VM and VM state
    - `vm.State` - the running VM itself: data stack, command stack, current
      environment, traceback, and the most recent call
    - `vm.StackEntry` - one traceback frame: a name, a source `types.Location`,
      and a kind
    - `vm.StackCount` - a `vm.StackEntry` plus a repeat count; consecutive
      identical frames are compressed into a single `vm.StackCount`
    - `vm.DynamicWind` - one dynamic-wind frame: before/after thunks and a
      parent frame; the chain of these is part of what a `types.Continuation`
      captures
- FFI
    - `ffi.Value` - wraps a host JS value that is not otherwise boxed, so it can
      live in props and be passed around
    - `ffi.Promise` - wraps a JS `Promise`, so async host functions can be
      awaited from JEB code
- Docstring parsing
    - `doc.Doc` - a parsed docstring: a summary, the body as `doc.DocNode`s, and
      the metadata tags (`param`, `returns`, `throws`, ...)
    - `doc.DocNode` - one node of a parsed docstring body: a paragraph, a
      header, or inline markup
- (Backolon) IO
    - `io.Response` - (subclass of `bytes`) the result of a fetch: status,
      headers, and the body
    - `io.Storage` - a localStorage store, dict-like
    - `io.Database` - an IndexedDB database
- (Backolon) Parsing mechanism
    - `parse.Grammar` - a compiled grammar that parses text into CSTs
    - `parse.Rule`
    - `parse.Combinator`
        - (all of Backolon's combinators)
- (Backolon) Import system
    - `import.Finder` - finds a module by name, like Python importlib's finders
    - `import.Loader` - loads a found module into a `types.Module` and runs it
- TODO: (Backolon) game standard library
    - `units.Quantity` (`float` subclass) - wraps hyperspace `Quantity` (though
      you have to create a `units.UnitSystem` manually and activate it with a
      context manager)
    - `types.Matrix` - wraps game-math `Matrix`
        - `mat2` - wraps game-math `Mat2`
        - `mat2x3` - wraps game-math `Mat23`
        - `mat3` - wraps game-math `Mat3`
        - `mat4` - wraps game-math `Mat4`
    - `types.Vector`
        - `vec2` - wraps game-math `Vec2`
        - `vec3` - wraps game-math `Vec3`
        - `quat` - wraps game-math `Quaternion`
