# Backolon

Backolon is a tiny, homoiconic programming language built around pattern-driven syntax and first-class continuations.

It is designed to be:

* **Homoiconic:** code and data share the same representation, so macros and syntax extensions are easy.
* **Keywordless:** operators and control flow are ordinary values, not reserved words.
* **Embeddable:** designed to be embedded relatively painlessly in a larger Javascript/Typescript app.

## Quick example

```backolon
x := 42

double := [n] => n * 2

numbers := [1, 2, 3] + [4, 5]

print (if (#numbers > 5) "long list" "short list")
```

## Why Backolon?

Backolon is meant for people who want a tiny language where syntax is data, macros are first-class, and control flow is expressed through continuations rather than special keywords.

## Embedding in JavaScript

Backolon exposes parsing, evaluation, and scheduler APIs so you can embed it directly in JS applications.

```js
import * as Backolon from "@r47onfire/backolon";

const scheduler = new Backolon.Scheduler([
    Backolon.BUILTINS_MODULE,
    Backolon.FFI_MODULE
], console.log);
const task = scheduler.startTask(0, "x := 1", null, Backolon.UNKNOWN_LOCATION.file);
scheduler.stepUntilSuspended();
console.log(task.result);
```

## Learn more

* [Browser REPL][repl] - run Backolon interactively
* [Language docs][langdocs] - syntax and runtime reference
* [Embedding docs][jsdoc] - JavaScript API and examples

## Why is it called "Backolon"?

Good question. [@imaginarny](https://github.com/imaginarny) suggested the name when I showed him an early draft of the syntax back when this was just "the scripting language I'm making for [Aelith](https://github.com/r47onfire/aelith)"[^1]. Perhaps it was the quote operator `` ` `` used to escape a symbol so it can be used as a key in a map combined with the syntax for maps, `[:]` for an empty one.

## Okay, how does it work?

### Parsing

No token is ignored. Thus, un-parsing is possible, 1-to-1 roundtripping.

The general stage 1 parser just pulls things into groups (and processes escapes in strings). These block delimiters are hard-coded and cannot be changed.

After that, everything is controlled by pattern-matching.

All of the operator-based syntaxes are based on rewriting it as a function or macro call.

For example, `a + b` gets rewritten into `__add a b`. `a := 1` gets rewritten into `__declare a 1`. `[a b] => {body}` gets rewritten into `__build_lambda [a b] {body}`.

### Lambdas

These are kind of a hybrid between a macro and a function. The parameters can be marked as lazy, in which case when it's called, the chunk of code that would normally be evaluated to produce the argument is instead left unevaluated and passed in as a one-argument lambda that when called with a mapping, evaluates the body in its original scope + that mapping. The mapping is mutated.

If the whole lambda is marked as a macro, the result is evaluated again in the caller's scope and the result of *that* is used as the return value. Combined with the template block, this can be used to create constructs that lazy parameters themselves cannot, or even self-modifying code.

Lambdas can also be marked as splice functions, which means that the result will be spliced into the caller's argument list expression, instead of just being passed as a single list value.

### Patterns

Backolon's patterns function structurally similar to regular expressions, just with a different syntax to be able to accommodate each matchable element potentially being a whole object and not just a single character.

A pattern definition works like a macro, except the parameters (capture groups) aren't wrapped with lambdas in the same way a macro is. Thus, patterns can be unhygenic if they want to be. Additionally the pattern definition context can access the match target's block type (round, curly, square, string interpolation, etc) so it can change its behavior based on that. For example the behavior of the `,` pattern changes between when it's inside a square block (where it expands `+`, which works to concatenate lists or merge maps) versus when it's inside a round block (where it means nothing).

Internally, Backolon uses Thompson's NFA construction for handling arbitrary patterns, so it's quite literally impossible to write a 'pathological' pattern that could cause the algorithm to take a very long time to match, as opposed to if I had used a backtracking algorithm.

### Runtime

Backolon's control flow model leans on first-class functions and continuations very heavily. Every lambda that gets created (except for auto-wrapped syntax blocks passed to macros) has a variable named `return` automatically injected into its scope, which is initialized with a continuation jumping back to its invocation. Because of this property, the definition of a Scheme-like call/cc is trivial:

```backolon
callcc := [f] => f return
```

Because `return` is just another variable, and not a keyword, it can be assigned to and passed around. For example, here's how control flow macros are implemented:

```backolon
while := [@cond @body] => callcc [break] => (
    continue := nil
    callcc [k] => continue = k
    if (cond [:]) (
        body [`break:, `continue:]
        continue!
    )
)
generator := [@body] => (
    cont := nil
    resume := [] => body [`yield:]
    yield := [value] => callcc [k] => (
        resume = k
        cont value
    )
    [sent] => callcc [k] => (
        cont = k
        resume sent
    )
)
foreach := [@varname:name list @body] => (
    i := 0
    while i < #list (
        callcc [k] => body [varname: list->i, `break:, `continue: k]
        i += 1
    )
)
```

[repl]: https://r47onfire.github.io/backolon/repl/
[langdocs]: https://r47onfire.github.io/backolon/docs/
[jsdoc]: https://r47onfire.github.io/backolon/embedding/

[^1]: [@imaginarny](https://github.com/imaginarny) also created the logo, thanks!
