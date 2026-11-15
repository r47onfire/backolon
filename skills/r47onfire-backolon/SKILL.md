---
description: homoiconic scripting language
license: AGPL-3.0-only
name: r47onfire-backolon
---

# @r47onfire/backolon

homoiconic scripting language

## See Also

- **r47onfire-nebula** (`node_modules/@r47onfire/nebula/skills/r47onfire-nebula`) — Packrat parser engine with left-recursion support, producing a round-trippable CST. Also: parser, packrat, peg, grammar, left-recursion, cst.
- **edit-me** (`node_modules/@r47onfire/nebula/skills/edit-me`) — API reference for edit_me

## Quick Reference

**runtime:** `Finder` (A source of module files for a particular kind of URL (a filesystem, an HTTP
host, an in-memory map, ), `Importer` (Coordinates the whole module-loading pipeline: a Resolver expands an
import specifier into candidate URLs, Finders fetch the winning
candidate's contents, and a Loader turns those contents into a running
Module in the VM), `SourceTracker` (A module's source text, retained after loading so the parser can report
errors against it and tooling can syntax-highlight it), `Loader` (Object whose job it is to download or open the file and then load its
contents into a module object), `JavascriptModuleLoader` (Loader that handles loading the Javascript modules via `import()`), `BackolonSourceModuleLoader` (Loader that handles loading Backolon source code), `Module` (A Backolon module: one loaded (or still loading) source file, with its own
global environment, its identity URL, and its named exports), `Resolver` (Strategy for turning an import specifier into candidate file URLs), `IndexResolver` (The default resolver: yields the path as-is, then with each known module-file
extension appended, then as a directory containing an `index` file with each
extension), `BackolonVM` (The JEB VM specialized for Backolon: on top of the base VM it keeps the
module cache, the current parser (if any), and the span tables that map JEB
Locations back to source ranges), `JSModule` (Interface for what a Javascript module needs to comply with to be able to be
imported), `JSONModule` (Interface for a JSON module object), `JSONSourceMap` (Not a sourcemap-V3 since the mappings don't have any concept of "compiled
line/pos"), `BackolonVMState` (The part of BackolonVM state captured by JEB's state snapshot/rollback
mechanism), `ModuleCacheEntry` (Everything the VM tracks about one registered module), `OP_do_import` (The `import` opcode: pops an absolute URL off the data stack and loads that
module (running it as the main module if `asMain` is set)), `MODULE_NAME` (Special symbol identifier used to identify module names that can't be
shadowed), `MODULE_SELF` (Special symbol identifier used to link a module's environ...), `LOCATION_TAG` (Brand symbol stamped on arrays that are Locations, so they can be told
apart from plain number pairs)
**parser:** `backolonGrammar` (The Backolon grammar, as plain combinator data), `all_tags` (Every highlight tag name used anywhere in backolonGrammar, collected
by walking all of its combinator trees (e)
**plugin:** `default` ([ESBuild](https://esbuild)

## References

Load these on demand — do NOT read all at once:

- When using a class → read `references/classes.md` for properties, methods, and inheritance
- When defining typed variables or function parameters → read `references/types.md`
- When using exported constants → read `references/variables.md`

## Links

- [Repository](https://github.com/r47onfire/backolon)
- Author: dragoncoder047