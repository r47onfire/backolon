# Backolon Embedding Guide

This guide explains how to embed Backolon in JavaScript and use the runtime API that you get when importing `"backolon"`.

Backolon provides a small API surface for parsing, tokenizing, and evaluating source:

* `parse(source, location)` - returns the parsed AST.
* `tokenize(source, location)` - returns raw tokens.
* `Scheduler` - runs Backolon tasks and manages execution.
* `BUILTINS_MODULE`, `FFI_MODULE` - modules to provide the core functionality and Javascript FFI.
* `Unparser`, `DEFAULT_UNPARSER` - used to turn a Backolon object back into a readable string representation of it.

## Basic embedding example

```js
import * as Backolon from "@r47onfire/backolon";

const scheduler = new Backolon.Scheduler(
    // the list of built-in modules to include
    [
        // the BUILTINS_MODULE provides all the code
        // features, leaving it out breaks everything
        Backolon.BUILTINS_MODULE,
        Backolon.FFI_MODULE
    ],
    // print hook
    console.log,
);

const task = scheduler.startTask(
    0, // the priority
    "x := 1", // the code to run
    null, // custom environment, or null to inherit globals
    new URL("whatever"), // the source identifier of the code
);

// Run the code
scheduler.stepUntilSuspended();

console.log("result:", task.result);
```

## Re-entrant execution

By saving the task and manipulating it, you can execute multiple commands in the same environment in sequence, allowing the previous statements to influence the next:

```js
const scheduler = new Backolon.Scheduler([
    Backolon.BUILTINS_MODULE,
    Backolon.FFI_MODULE
], console.log);

const task = scheduler.startTask(0, "", null, Backolon.UNKNOWN_LOCATION.file);
const env = task.stack[0].env;

const commands = ["x := 1", "x = x + 5", "x"];
for (var i = 0; i < commands.length; i++) {
    const ast = Backolon.parse(commands[i], new URL(`command:${i}`));
    task.enter(ast, ast.loc, env);
    scheduler.stepUntilSuspended();
    console.log("result:", task.result);
}
```

This is what is used in the REPL to allow commands to be executed in the REPL environment and build on each other.

## Using the built-ins and FFI module

The built-in modules provide the core language environment:

* `BUILTINS_MODULE` - standard syntax patterns used everywhere
* `FFI_MODULE` - JavaScript interop helpers used by the runtime

Pass both modules to `Scheduler` to make the language ready to execute most programs.
