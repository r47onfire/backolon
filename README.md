# Backolon

A little programming language I came up with.

## Features

* **Homoiconic.** Define new syntactic macros to extends the language.
* **Keywordless.** `return`, `break`, `continue`, `while`, `if`, ... they're all just variables and can be passed around and reassigned.
* **Stateful.** The virtual machine state can be stopped and serialized at any point, and restored exactly.

## Why is it called "Backolon"?

Good question. @imaginarny suggested the name when I showed him an early draft of the syntax back when this was just "the scripting language I'm making for [Aelith](https://github.com/r47onfire/aelith)". Perhaps it was the quote operator `` ` `` used to escape a symbol so it can be used as a key in a map combined with the syntax for maps, `[:]` for an empty one.

## Okay, how does it work?

### Parsing

No token is ignored. Thus, un-parsing is possible, 1-to-1 roundtripping.

The general stage 1 parser just pulls things into groups (and processes escapes in strings). These block delimiters are hard-coded and cannot be changed.

After that, everything is controlled by pattern-matching.

All of the operator-based syntaxes are based on rewriting it as a function or macro call.

For example, `a + b` gets rewritten into `__add a b`. `let a = 1` gets rewritten into `__declare a 1`. `[a b] => {body}` gets rewritten into `__build_lambda [a b] {body}`.

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
let callcc = [f] => f return
```

Because `return` is just another variable, and not a keyword, it can be assigned to and passed around. For example, here's how control flow macros are implemented:

```backolon
let while = [@cond @body] => callcc [break] => (
    let continue = nil
    callcc [k] => continue = k
    if (cond [:]) (
        body [`break:, `continue:]
        continue!
    )
)
let generator = [@body] => (
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
let foreach = [@varname:name list @body] => (
    let i = 0
    while i < #list (
        callcc [k] => body [varname: list->i, `break:, `continue: k]
        i++
    )
)
```
