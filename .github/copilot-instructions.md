# Workspace instructions for humans and LLMs

this is Backolon, a tiny homoiconic, keywordless pattern-matching programming language. The interpreter is written in typescript using ES6 module syntax.

---

## General architecture of the language

### Parsing

No token is ignored. Thus, un-parsing is possible, 1-to-1 roundtripping.

The general stage 1 parser just pulls things into groups (and processes escapes in strings). These block delimiters are hard-coded and cannot be changed.

After that, everything is controlled by pattern-matching.

All of the operator-based syntaxes are based on rewriting it as a function or macro call.

For example, `a + b` gets rewritten into `(add a b)`. `let a = 1` gets rewritten into `(assign (declare a) 1)`. `[a b] => {body}` gets rewritten into `(createLambda [a b] {body})`.

### Lambdas

These are kind of a hybrid between a macro and a function. The parameters can be marked as lazy, in which case when it's called, the chunk of code that would normally be evaluated to produce the argument is instead left unevaluated and passed in as a one-argument lambda that when called with a mapping, evaluates the body in its original scope + that mapping. The mapping is mutated.

If the whole lambda is marked as a macro, the result is evaluated again in the caller's scope and the result of *that* is used as the return value. Combined with the template block, this can be used to create constructs that lazy parameters themselves cannot, or even self-modifying code.

Lambdas can also be marked as splice functions, which means that the result (after macro expansion, if so marked) will be spliced into the caller's argument list expression, instead of just being passed as a single list value.

### Patterns

Backolon's patterns function structurally similar to regular expressions, just with a different syntax to be able to accommodate each matchable element potentially being a whole object and not just a single character.

A pattern definition works like a macro, except the parameters (capture groups) aren't wrapped with lambdas in the same way a macro is. Thus, patterns can be unhygenic if they want to. Additionally the pattern definition context can access the match target's block type (round, curly, square, string interpolation, etc) so it can change its behavior based on that. For example the behavior of the `,` pattern changes between when it's inside a square block (where it expands to a call to `append`) versus when it's inside a round block (where it expands to the macro used to implement line execution and the C-style comma operator).

Internally, Backolon uses Thompson's NFA construction for handling arbitrary patterns, so it's quite literally impossible to write a 'pathological' pattern that could cause the algorithm to take a very long time to match, as opposed to if I had used a backtracking algorithm.

### Runtime

Backolon's control flow model leans on first-class functions and continuations very heavily. Every lambda that gets created (except for auto-wrapped syntax blocks passed to macros) has a variable named `return` automatically injected into its scope, which is initialized with a continuation jumping back to its invocation. Because of this property, the definition of a Scheme-like call/cc is trivial:

```backolon
callcc = [f] => f return
```

Because `return` is just another variable, and not a keyword, it can be assigned to and passed around. For example, here's how control flow macros are implemented:

```backolon
while = [@cond @body] => callcc [break] => (
    let continue = nil
    callcc [k] => continue = k
    if (cond [:]) (
        body [`break:, `continue:]
        continue!
    )
)
generator = [@body] => (
    let cont = nil
    let resume = [] => body [`yield:]
    let yield = [value] => callcc [k] => (
        resume = k
        cont value
    )
    [sent] => callcc [k] => (
        cont = k
        resume sent
    )
)
foreach = [@var list @body] => (
    let varname = extract var `symbol
    let i = 0
    while i < #list (
        callcc [k] => body [varname: list->i, `break:, `continue: k]
        i++
    )
)
```

---

## Development cold start

0. make sure `pnpm` is installed.
1. install dependencies: `pnpm install`

---

## Basic tasks

* to build: `pnpm build`
  * don't use `pnpm build-for-fuzzer`; that builds it as a CommonJS module which is only used by the fuzzer and not exported/uploaded to npm
  * don't use `pnpm tsc`; that will only lint and not build (tsc is set to `noEmit: true` since esbuild handles building)

* to run the unit tests: `pnpm test`, or start a background terminal and `pnpm test:watch` (which reruns automatically on file changes). Do `AGENT=1 pnpm test` to remove all of the passing-test noise and only show the failures.

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
```

Top‑level exports live in `src/index.ts`.

---

## Typescript conventions

* `strict` mode is on.
* use 4 spaces for indentation.
* always use semicolons at the end of lines.
* there's no formatting requirement; I just use VSCode's default cmd+shift+I formatting.
  * avoid unnecessary whitespace changes
* always place the opening brace on the same line, and the closing brace on its own line, with the only exception being a `} else {` when it's a simple if-else (no else-ifs).
* prefer double-quoted strings over single-quoted strings where possible
* give all object properties that are not meant to be used directly (even if you can't mark them `private`) names that start with `_` - that way esbuild can name-mangle all the properties that start with `_` without consequence (currently turned off but it's easy to put back).
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
