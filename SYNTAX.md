# Backolon Parsing and Core Syntax

## Abstract

This document specifies the intended initial parsing model and core surface syntax of Backolon. It defines the modified-Pratt parselet model, source spans, comments, statement boundaries, function bodies, implicit calls, missing expressions, pipeline topics, and self-modifying syntax.

This document is a design specification for the parser and core language. It does not define every library operation or every future syntax extension.

## Requirements Language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals.

## Status of This Specification

This document describes the intended language design. Implementations MAY be incomplete, but an implementation claiming conformance to a section MUST follow that section's normative rules.

## 1. Design Goals

Backolon is intended to be:

- homoiconic: syntax can be represented as data and transformed by programs;
- keyword-light: keywords such as `fn`, `if`, and `end` are all "soft keywords" and can be used as variable names where the defined syntax is not met; and
- self-modifying: a running program can replace, add, remove, or reorder parselets and can therefore change the syntax used for subsequently parsed source.

## 2. Source Positions and Spans

A source position is an absolute offset into the original source text. A source span is a half-open interval `[start, end)` associated with a source file.

Every successfully parsed expression MUST have an expression span covering the expression's actual source text. Leading or trailing whitespace, comments, or statement separators MUST NOT be included in that expression span.

An implementation MAY retain a larger syntactic span for a construct. The expression span MUST remain available for decisions that depend on where an expression begins or ends.

Line and column information MUST be derivable from source positions. The parser MUST be able to determine whether two positions are on the same physical source line.

## 3. Modified-Pratt Parselets

### 3.1 Parselet responsibilities

There is no global, authoritative tokenization pass. The parser MUST determine the next syntactic unit using the parselets active at the current source position.

A parselet consists conceptually of:

- a prefix matcher, which MUST be a sticky regular expression;
- a precedence, or precedence constraints from which precedence can be derived; and
- a parse handler.

At an expression position, the parser MUST try applicable parselets in precedence order. A parselet MAY consume source and return an expression. A parselet MAY consume source and use a continuation to re-enter the parse loop without returning an expression. A parselet MAY decline to parse without consuming source.

Declining without consuming source is a normal result when an enclosing parselet is checking whether its construct has ended. At the top level, an unexpected lack of an expression MUST be reported as a syntax error.

### 3.2 Parselet ownership

The parselet that introduces a construct MUST own that construct's internal syntax and closing syntax. The general parser MUST NOT need a universal delimiter stack merely to describe ordinary constructs.

Examples:

- The `?` parselet MUST parse the true expression, require `:`, parse the false expression, and then return.
- The `[` parselet MUST parse list elements and separators until it sees `]`, then consume `]`.
- The call parselet MUST parse arguments until it sees `)`, then consume `)`.
- The comment parselet MUST consume its comment and re-enter the parse loop.

An enclosing parselet MAY invoke expression parsing in a local mode where failure means that the enclosing construct's closer is next. The enclosing parselet MUST validate and consume its own closer. Precedence and construct termination are separate concerns: precedence determines whether an expression can continue, while the owning parselet determines what its construct accepts and where it stops.

### 3.3 Failed expression attempts

An expression parse operation MUST have a unique non-consuming failure result. The failure result MUST leave the parser position unchanged.

An owning parselet MAY interpret that result as completion if its own syntax permits the construct to end at the current position. Otherwise, it MUST report a syntax error. A missing expression MUST NOT be converted to `null` globally.

## 4. Source Preservation, Token Views, and Grammar Changes

The parser MUST retain the original source text and source offsets. It MUST NOT depend on a fixed token stream whose lexical decisions cannot change.

An implementation MAY create ephemeral token views for performance, highlighting, or diagnostics. Such views MUST NOT be invalidated when the active grammar changes.

The reason for this restriction is that a self-modifying program MAY redefine what constitutes an identifier, literal, operator, delimiter, comment, or other syntactic unit. Source that initially appears to contain one unit MAY become three units after a grammar change.

## 5. Whitespace, Newlines, and Comments

### 5.1 Whitespace

Whitespace is insignificant except where the active parselet gives it syntactic meaning. Newlines MUST remain available as source information even when they are otherwise ignored.

An expression MAY continue across a newline when the parselet that currently owns the expression requires more input, such as the right operand of an operator or the remainder of a delimited construct.

Same-line whitespace application, specified in Section 8, MUST NOT cross a newline.

### 5.2 Comments

The initial line-comment syntax is:

```backolon
# line comment
## block comment ##
```

The `#` comment MUST be implemented as a parselet. The comment parselet MUST consume `#` and all following characters up to, but not including, the newline. It MUST then use its continuation to resume parsing at the next source position. A comment MUST NOT produce an expression.

The parser MUST NOT require a globally hard-coded category of trivia. A parselet that needs to make a speculative decision SHOULD parse a candidate expression normally, inspect its expression span, and restore the parser position if the candidate is not valid for the construct.

## 6. Statements and Separators

A statement is an expression or an empty statement slot in a statement sequence.

A newline MAY terminate a statement, but it MUST NOT otherwise become a semantic expression. A newline terminates a statement when the current statement has completed and no active parselet requires more input. A newline MUST NOT trigger an implicit call.

Semicolons separate statement slots. An empty statement slot evaluates to `null` in a statement sequence.

The intended examples are:

```text
a;;b  ==  a; null; b
;;     ==  null; null;
```

The first and last semicolons in `;;` are separators around one empty slot; they do not cause the parser to discard the separators themselves. An implementation MUST apply the same empty-slot rule consistently to leading and trailing separators. A final separator that merely terminates a preceding non-empty statement MAY be omitted from the resulting sequence.

The statement-sequence parselet owns semicolon handling. It MUST NOT require the global parser to assign meaning to consecutive separators.

## 7. Function Expressions

The initial function introducer is `fn`.

A function begins with a parameter list:

```backolon
fn(x, y) body
```

The `fn` parselet owns parameter-list parsing. To allow for future syntax extensions, parameter modifiers (including the existing lazy-parameter form `^x`) MUST NOT be special-cased, and MUST be parseable as existing functions elsewhere in the program (if only ones that throw errors instantly).

After the parameter-list closing `)`, a function has either an expression body or a block body.

### 7.1 Expression bodies

A function MUST use an expression body when a candidate expression begins on the same physical line as the parameter-list closing `)`:

```backolon
fn(x) x + 1
fn(x) x + 1 end
```

The body MUST consist of exactly one expression. An `end` MAY follow that expression; when present in a position owned by the function parselet, it MUST be consumed as the function's optional explicit terminator.

The function parselet MUST make this decision using source positions or expression spans, not raw-character lookahead:

1. It saves the parser position immediately after the parameter-list `)`.
2. It parses one expression normally. Comment parselets MAY consume comments and continue parsing.
3. If the expression produced starts on the same physical line as the parameter-list `)` span end, the function uses that single expression as its body.
4. Otherwise, it continues parsing expressions until `end` to form a block body.

Consequently, the following is a block body because the expression begins on a later line:

```backolon
fn() # comment
    x + 1

# error: expected 'end'
```

The comment MUST NOT be treated as the function body.

### 7.2 Block bodies

When no same-line expression body is present, the function parses a sequence of statements:

```backolon
fn(x)
    first
    second
end
```

The function parselet MUST stop at the next `end` recognized as its closer. It MUST also stop when the enclosing parselet's syntax prevents another expression and returns control to that enclosing parselet. The function parselet MUST NOT consume the enclosing parselet's closer.

For example:

```backolon
callback(fn(x)
    foo
    bar)
```

MUST be parsed as a call whose argument is a function with the two-statement body `foo; bar`. The function stops because `)` cannot begin another expression, and the outer call parselet consumes `)`.

Nested functions require only the closers corresponding to actual block bodies:

```backolon
fn(x) callcc fn(y)
    z
end
```

The inner function owns `end`. The outer function has the one-expression body `callcc fn(y) z` and MUST NOT require a second `end`.

## 8. Calls

### 8.1 Explicit calls

Parenthesized calls use comma-separated arguments:

```backolon
f(x, y)
f()
```

The call parselet owns `(` and `)`. It MUST parse each argument in turn and MUST apply the missing-argument rules in Section 9.

### 8.2 Implicit whitespace calls

Backolon supports same-line, parenthesis-free calls. Whitespace application is recognized only when:

1. a complete callee expression has been parsed;
2. same-line whitespace follows the callee;
3. the next construct can begin an expression; and
4. no stronger active parselet claims the position.

Whitespace application MUST NOT cross a newline. Therefore:

```backolon
f x
```

is an implicit call, while:

```backolon
f
x
```

contains two statements.

The required grouping is:

```text
f x y z       == f(x(y(z)))
f x, y, z     == f(x, y, z)
f x y, z      == f(x(y, z))
f x(y) z      == f(x(y)(z))
f x(y), z     == f(x(y), z)
```

Whitespace application is right-nested in its argument position. A comma terminates the current implicit-call argument and supplies additional arguments to that same call. Explicit parentheses take precedence over whitespace application.

Whitespace MUST remain insignificant around operators, delimiters, and separators except where this section explicitly gives it meaning.

## 9. Missing Expressions and `null`

An empty expression slot has the value `null` only where the owning parselet explicitly permits an empty slot.

In a comma-separated call argument list, a missing argument is `null`:

```text
f(,)       == f(null)
f(1,)      == f(1)
f(1,,)     == f(1, null)
f(1,,2)    == f(1, null, 2)
```

In particular, `f(,)` is valid. When the call parser is expecting an argument and encounters `,`, it MUST insert `null`, consume the comma, and continue parsing the argument list. A trailing comma before `)` MUST be ignored rather than creating an additional argument.

In a statement sequence, an empty slot between separators is `null`, as specified in Section 6.

An operator or other construct that requires an expression MUST reject an empty slot unless that construct explicitly defines another meaning.

An implementation MAY retain a distinct source-preserving node for a missing argument or statement slot. Runtime evaluation MUST treat it as `null`.

## 10. Pipeline Topics and Member Access

The initial dialect assigns these meanings:

```text
#          line comment
.          member access
it         ordinary pipeline binding
@          import or resolve-URL-relative-to-current-file syntax
```

`it` MUST be an ordinary lexical name, not a reserved topic token. A pipeline expands conceptually as:

```backolon
x |> y
```

to:

```backolon
(fn(it) y) x
```

User code MAY shadow `it` according to ordinary lexical-scope rules. Nested pipelines MUST introduce nested bindings in the same manner as nested function parameters.

Examples:

```backolon
items |> it.length
items |> upper it
```

Member access uses dot syntax:

```backolon
value.length
user.name
```

## 11. Self-Modifying Syntax

A program MAY modify the active parselet set and its precedence constraints while it runs. A grammar mutation MUST affect source parsed after the mutation's parselet has returned control to the parser loop. Source already consumed MUST NOT be reparsed automatically.

A grammar mutation MAY:

- install or remove parselets;
- change a parselet's prefix matcher;
- change a parselet's precedence;
- change which syntax a parselet consumes;
- install new delimiters or expression forms.

If the precedence ordering is provided by constraints, the host MUST verify the constraint graph is solvable at the beginning of each new parse operation and raise a type error if it is not.

The parser MUST NOT rely on a permanent global tokenizer whose decisions survive grammar mutation. Cached token-like views MUST be invalidated or versioned by the active grammar.

The runtime MUST retain a bootstrap mechanism capable of introducing the initial syntax.

## 12. Error Handling

A parselet MUST fail when required internal syntax is absent. For example:

- `f(1` fails because the call parselet requires `)` after an explicit `(`;
- `a ? b` fails because the conditional parselet requires `:` and a false expression;
- `fn(x` fails because the parameter list is unterminated;
- an expression required after an operator cannot be replaced by an empty slot unless that operator explicitly permits it.

A non-consuming failed expression attempt is not, by itself, an error. The active owning parselet MUST decide whether the current source position is a valid end of its construct or an error.

## 13. Normative Examples

The following examples illustrate the required behavior:

```backolon
fn(x) x + 1

fn(x) # comment
    x + 1

fn(x) callcc fn(y)
    z
end

callback(fn(x)
    foo
    bar)

f x y z
f x, y, z
f x y, z
f x(y) z
f x(y), z

f(,)
f(1,,2)

first;;third

items |> it.length
items |> upper it
```
