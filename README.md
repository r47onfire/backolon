# Backolon

A little programming language I came up with.

## Features

* **Homoiconic.** Define new syntactic macros to extends the language.
* **Keywordless.** `return`, `break`, `continue`, `while`, `if`, ... they're all just variables and can be passed around and reassigned.
* **Stateful.** The virtual machine state can be stopped and serialized at any point, and restored exactly.

## Why is it called "Backolon"?

Good question. @imaginarny suggested the name when I showed him an early draft of the syntax back when this was just "the scripting language I'm making for [Aelith](https://github.com/r47onfire/aelith)". Perhaps it was the quote operator `` ` `` used to escape a symbol so it can be used as a key in a map combined with the syntax for maps, `[:]` for an empty one.

## Okay, how does it work?

Go read [.github/copilot-instructions.md](.github/copilot-instructions.md) and related files. This is part of the magic of LLMs - they are very good at extracting meaning from documents written for humans. I only put it there in order to force Copilot to read it every time, and I'm not going to write it twice.
