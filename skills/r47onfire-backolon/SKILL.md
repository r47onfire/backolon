---
description: homoiconic scripting language
license: AGPL-3.0-only
name: r47onfire-backolon
---

# @r47onfire/backolon

homoiconic scripting language

## Quick Reference

**parser:** `create_SysParser`, `forceStickyRegex`, `Token`, `Parser` (Parser state; functionally immutable but contains some internal memoization
tables that are computed when needed), `Parselet`, `Span` (Source location information for a token), `NO_MATCH`, `OP_runModule`
**runtime:** `Finder`, `Importer`, `SourceTracker`, `Loader` (Object whose job it is to download or open the file
and then load its contents into a module object), `JavascriptModuleLoader` (Loader that handles loading the Javascript modules via `import()`), `BackolonSourceModuleLoader` (Loader that handles loading Backolon source code), `Module`, `Resolver`, `IndexResolver`, `BackolonVM`, `JSModule` (Interface for what a Javascript module needs to comply with
to be able to be imported), `JSONModule` (Interface for a JSON module object), `JSONSourceMap` (Not a sourcemap-V3 since the mappings don't
have any concept of "compiled line/pos"), `OP_do_import`, `MODULE_NAME` (Special symbol identifier used to identify module names that can't be shadowed), `MODULE_SELF` (Special symbol identifier used to link a module's environ...), `LOCATION_TAG`
**plugin:** `default` ([ESBuild](https://esbuild)

## References

Load these on demand — do NOT read all at once:

- When calling any function → read `references/functions.md` for full signatures, parameters, and return types
- When using a class → read `references/classes.md` for properties, methods, and inheritance
- When defining typed variables or function parameters → read `references/types.md`
- When using exported constants → read `references/variables.md`

## Links

- [Repository](https://github.com/r47onfire/backolon)
- Author: dragoncoder047