# Workspace instructions for LLMs

this is Backolon, a tiny homoiconic, keywordless pattern-matching programming language. The interpreter is written in typescript using ES6 module syntax.

for an overview of the language itself and its syntax and behavior, check out the [README](../README.md).

---

## Development cold start

0. make sure `pnpm` is installed.
1. install dependencies: `pnpm install`

---

## Basic tasks

* to build: `pnpm build`
  * don't use `pnpm build-for-fuzzer`; that builds it as a CommonJS module which is only used by the fuzzer and not exported/uploaded to npm
  * don't use `pnpm tsc`; that will only lint and not build (tsc is set to `noEmit: true` since esbuild handles building)

* to run the unit tests (doesn't require build beforehand): `AGENT=1 pnpm test`, or start a background terminal and `AGENT=1 pnpm test:watch` (which reruns automatically on file changes).

* to fuzz test: `pnpm fuzz {entrypoint}`
  * this runs the fuzzer on `test/fuzz/{entrypoint}.fuzz.cjs`
  * inputs get dumped into `test/fuzz/inputs/{entrypoint}/`
  * the fuzzer will keep running until it crashes, so just ^C it after 30 or so lines of "PULSE" with no "NEW".
  * crash-inducing inputs will *not* get put into `test/fuzz/inputs/{entrypoint}/` - those get put in the top level and it can't be changed as far as I know.

---

## Project structure (may be out of date)

```
src/
  objects/        # core data structures (Thing, maps, etc.)
  parser/         # tokenizer, stage one parser, unparser
  patterns/       # pattern matching engine, meta-pattern parser
  runtime/        # environment, scheduler, tasks, functor handling
  stdlib/         # builtin macros/functions that define core syntax and functionality
test/             # Bun-based tests and fuzzing harnesses
  fuzz/           # fuzz targets (inputs folder's contents is .gitignore'd; none of them are seeds)
website/          # files for backolon.js.org
```

Top‑level exports live in `src/index.ts` and `src/plugin/index.ts` for the esbuild/bun plugin.

---

## Typescript conventions

* `strict` mode is on.
* use 4 spaces for indentation.
* always use semicolons at the end of lines.
* there's no formatting requirement; I just use VSCode's default cmd+shift+I formatting.
  * avoid unnecessary whitespace changes
* always place the opening brace on the same line, and the closing brace on its own line, with the only exception being a `} else {` when it's a simple if-else (no else-ifs).
* prefer double-quoted strings over single-quoted strings where possible
* give all object properties that are not meant to be used directly (even if you can't mark them `private`) names that start with `_` - that way bun can name-mangle all the properties that start with `_` without consequence (currently turned off but it's easy to put back).
  * for user-facing properties, the name length should be inversely proportional to its frequency of use. For example all the properties of `Thing` get used a lot so they have one-character names (but doc comments to explain what they are).
* let the code speak for itself. stating what the code does in a comment, when it would be obvious by reading it, just wastes time (and tokens). however, do not be shy about explaining potentially counterintuitive behavior or gotchas.

---

## Notes on adding new fuzzer entrypoints

* The fuzzer is actually kind of stupid; it instruments the code by reparsing it and injecting instrumentation on every line, and the parser can't handle ES6 module syntax. (This is why `pnpm build-for-fuzzer` uses commonjs mode.)
* Because the fuzzer harnesses can't use a second import to peek into the internals of Backolon to test it, they can only test stuff exported by the main `src/index.ts`.
* This is also why the stack trace that prints out when the fuzzer does find a crash is completely useless apart from the functions name, since the fuzzer injects code, the line/column numbers have changed.

The fuzzer entry points should use this template:

```js
const { stuff } = require("../../dist/backolon.cjs");
module.exports.fuzz = function fuzz(src) {
    /* keep this line: */
    // if (!/^[\x32-\x7F]*$/.test(src.toString())) return;
    /* INITIALIZATION */
    try {
        /* TEST STUFF WITH src.toString() */
    } catch (e) {
        if (!(e instanceof BackolonError)) throw e;
    }
}
```
