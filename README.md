# Backolon

Backolon is a tiny, homoiconic programming language built around pattern-driven syntax and first-class continuations.

It is designed to be:

* **Homoiconic:** code and data share the same representation, so macros and syntax extensions are easy.
* **Keywordless:** operators and control flow are ordinary functions and syntactic macros, not reserved words.
* **Embeddable:** designed to be embedded relatively painlessly in a larger Javascript/Typescript app.

## Quick example

```backolon
## Hello World
print "Hello, World!"

## List filtering, mapping, reducing
["hello", "world", "!"] |?> it != "!" |*> upper it |+> that + it ## ->"helloworld"

## Fizzbuzz
let fizzbuzz = fn(n) n % 15 == 0 ? "fizzbuzz" : n % 5 == 0 ? "buzz" : n % 3 == 0 ? "fizz" : "{n}"
foreach i in range(1, 100) do
    print fizzbuzz i
end

## yin yang puzzle
let yinHelper = fn(char) fn(c) ((fn(cc) (print char; cc)) (callcc fn(c) c))
let yin = (yinHelper "*"), yang = (yinHelper "@") in yin yang end
```

## Why Backolon?

Backolon is meant for people who want a tiny language where syntax is data, macros are first-class, and control flow is expressed through continuations rather than special keywords.

## Embedding in JavaScript

Backolon exposes parsing, evaluation, and runtime APIs so you can embed it directly in JS applications.

<!-- ```js
import * as Backolon from "@r47onfire/backolon";

const scheduler = new Backolon.Scheduler([
    Backolon.BUILTINS_MODULE,
    Backolon.FFI_MODULE
], console.log);
const task = scheduler.startTask(0, "x := 1", null, Backolon.UNKNOWN_LOCATION.file);
scheduler.stepUntilSuspended();
console.log(task.result);
``` -->

## Learn more

* [Browser REPL][repl] - run Backolon interactively
* [Language docs][langdocs] - syntax and runtime reference
* [Embedding docs][jsdoc] - JavaScript API and examples

## Why is it called "Backolon"?

Good question. [@imaginarny](https://github.com/imaginarny) suggested the name when I showed him an early draft of the syntax back when this was just "the scripting language I'm making for [Aelith](https://github.com/r47onfire/aelith)[^1]. Perhaps it was the quote operator `` ` `` used to escape a symbol so it can be used as a key in a map combined with the syntax for maps, `[:]` for an empty one.

## Okay, how does it work?

### Parsing

There is no tokenizer. Backolon parsing is done via a modified Pratt parsing algorithm that utilizes "parselets", which are each given a precedence and a prefix regular expression (matching one token) and when a match is found, the parselet is called to finish parsing the expression.

The parselet then implements the expression by compiling the parsed syntax into a piece of [JEB][jeb] code, which is just JSON but looks a lot like Lisp or Scheme.

For example, `a + b` gets rewritten into `["+", a, b]`. `a = 1` gets rewritten into `["let", [["a", 1]], ...]`. `[a b] => {body}` gets rewritten into `["lambda", ["a", "b"], body]`.

### Lambdas

These are kind of a hybrid between a macro and a function. The parameters can be marked as lazy, in which case when it's called, the chunk of code that would normally be evaluated to produce the argument is instead left unevaluated and passed in as a one-argument lambda that when called with a mapping, evaluates the body in its original scope + that mapping. The mapping is mutated.

If the whole lambda is marked as a macro, the result is evaluated again in the caller's scope and the result of *that* is used as the return value. Combined with the template block (which acts like Scheme quasiquote), this can be used to create constructs that lazy parameters themselves cannot, or even self-modifying code.

<!-- Lambdas can also be marked as splice functions, which means that the result will be spliced into the caller's argument list expression, instead of just being passed as a single list value. -->

### Runtime

Backolon's control flow model leans on first-class functions and continuations very heavily. Every lambda that gets created (except for auto-wrapped syntax blocks passed to macros) has a variable named `return` automatically injected into its scope, which is initialized with a continuation jumping back to its invocation. Because of this property, the definition of a Scheme-like call/cc is trivial:

```backolon
callcc = [f] => f return
```

Because `return` is just another variable, and not a keyword, it can be assigned to and passed around. For example, have a look at the control flow structures in [the core file](./src/stdlib/core.bk) - they use call/cc extensively.

[jeb]: https://github.com/r47onfire/jeb
[repl]: https://backolon.js.org/repl/
[langdocs]: https://backolon.js.org/docs/
[jsdoc]: https://backolon.js.org/api/backolon/

[^1]: [@imaginarny](https://github.com/imaginarny) also created the logo, thanks!
