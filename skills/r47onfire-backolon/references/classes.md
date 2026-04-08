# Classes

## `BackolonError`
Base class for Backolon parse and runtime errors.
```ts
constructor(message: string, trace: LocationTrace, notes: ErrorNote[]): BackolonError
```
**Properties:**
- `trace: LocationTrace` — 
- `notes: ErrorNote[]` — 
**Methods:**
- `displayOn(sources: Record<string, string>): string` — 
- `addNote(message: string, loc: LocationTrace): void` — 

## `ErrorNote`
A single note or stack frame attached to a Backolon error.
```ts
constructor(message: string, loc: LocationTrace): ErrorNote
```
**Properties:**
- `hash: number` — 
- `message: string` — 
- `loc: LocationTrace` — 
**Methods:**
- `format(onSources: Record<string, string>): string` — 

## `LocationTrace`
Source location information for Backolon parsing and runtime errors.
```ts
constructor(line: number, col: number, file: URL, source: [string, LocationTrace] | null): LocationTrace
```
**Properties:**
- `line: number` — 
- `col: number` — 
- `file: URL` — 
- `source: [string, LocationTrace] | null` — 

## `ParseError`
Thrown when an early-stage parse error occurs.
```ts
constructor(message: string, trace: LocationTrace, notes: ErrorNote[]): ParseError
```
**Properties:**
- `trace: LocationTrace` — 
- `notes: ErrorNote[]` — 
**Methods:**
- `displayOn(sources: Record<string, string>): string` — 
- `addNote(message: string, loc: LocationTrace): void` — 

## `RuntimeError`
Thrown for all other error kinds - type errors, pattern match errors, recursion errors, length errors, etc.
```ts
constructor(message: string, trace: LocationTrace, notes: ErrorNote[]): RuntimeError
```
**Properties:**
- `trace: LocationTrace` — 
- `notes: ErrorNote[]` — 
**Methods:**
- `displayOn(sources: Record<string, string>): string` — 
- `addNote(message: string, loc: LocationTrace): void` — 

## `Thing`
Every object in Backolon is wrapped or implemented by this class.
```ts
constructor<T>(t: T, c: T extends ThingType ? ChildrenType<T> : Thing<string | ThingType>[], v: T extends ThingType ? ValueType<T> : any, s0: string, s1: string, sj: string, loc: LocationTrace, hashable: boolean, valueInHash: boolean): Thing<T>
```
**Properties:**
- `h: number | null` — Null if this or any child is not hashable.
- `t: T` — type
- `c: T extends ThingType ? ChildrenType<T> : Thing<string | ThingType>[]` — children
- `v: T extends ThingType ? ValueType<T> : any` — value
- `s0: string` — source prefix
- `s1: string` — source suffix
- `sj: string` — source joiner
- `loc: LocationTrace` — source location

## `Unparser`
Class for converting Things back into source text, or at least a readable representation.
```ts
constructor(): Unparser
```
**Properties:**
- `counter: number` — 
- `seen: Map<Thing<string | ThingType>, number>` — 
**Methods:**
- `pre(thing: Thing): string` — Returns the text to be put before the contents of the given Thing.
- `join(thing: Thing, parts: string[]): string` — Takes the string source of the children and joins it into a single string based on the Thing.
- `post(thing: Thing): string` — Returns the text to be put after the contents of the given Thing.
- `begin(): void` — Hook that gets called when an object is starting to be unparsed.
- `end(): void` — Hook that gets called when an object has finished being unparsed.
- `unparse(thing: Thing): string` — Main entry point to unparse an object to a string.
- `walk(thing: Thing): void` — Walks the object tree recursively, and saves which objects have been seen once or multiple times
in `this.seen`.
- `stringify(thing: Thing): string` — Stringifies the object tree, while noting shared and circular structure using Scheme
datums `#N=` and `#N#`.

## `MatchResult`
```ts
constructor(bindings: [Thing<name>, Thing<string | ThingType> | Thing<string | ThingType>[]][], span: [number, number]): MatchResult
```
**Properties:**
- `bindings: [Thing<name>, Thing<string | ThingType> | Thing<string | ThingType>[]][]` — 
- `span: [number, number]` — 

## `Scheduler`
Backolon task scheduler responsible for running code and native functions.
```ts
constructor(builtins: [NativeModule, ...NativeModule[]], printHook?: (x: string) => void, customNames: Record<string, (args: any[]) => any>): Scheduler
```
**Properties:**
- `tasks: Task[]` — List of currently active tasks, sorted by priority (lowest first). Tasks that have finished executing but haven't been removed from the list yet will have an empty stack.
- `recursionLimit: number` — Maximum allowed stack length before a task throws a recursion error.
Backolon uses its own stack and not the JavaScript call stack, so this serves
to prevent out-of-memory errors.
- `builtins: [NativeModule, ...NativeModule[]]` — List of builtin modules available to tasks run by this scheduler.
Each module's environment (native functions, patterns, variables) will be included
in the search path for new tasks.
- `printHook: (x: string) => void` (optional) — Called with a string whenever a task calls the Backolon `print` function.
Can be used to capture printed output in a custom environment (e.g. a web REPL).
**Methods:**
- `startTask(priority: number, code: string, envs: (Thing<env> | Thing<nil>)[] | null, filename: URL): Task` — Start a new task with the given code and environment.
The code can be provided as a string (in which case it will be parsed)
or as a pre-parsed Thing. The environment is a list of env Things, which will be searched in order when looking up variables;
if null or omitted, the environments of all builtin modules will be used.

The new Task will have its top-level block in a *new* environment that has the provided envs
as parents, so changes to the top-level block's environment won't affect the provided envs or other tasks that share those envs.
- `serializeTasks(): string` — Dumps the state of all tasks into a string, which can later be loaded with `loadFromSerialized` to restore the tasks and their states.
- `loadFromSerialized(str: string): void` — Deserializes a string produced by `serializeTasks` and adds the resulting tasks to the scheduler.
Note that the deserialized tasks will share the same Scheduler instance (this) as each other and any tasks that were already in the scheduler,
but will not share any state with tasks that were already in the scheduler before (e.g. they won't share environments or variables).
- `stepUntilSuspended(maxSteps: number): boolean` — Run tasks until all tasks are suspended or complete or the optional maxSteps limit is reached (-1 or undefined means no limit).
Returns true if any progress was made (i.e. any task executed at least one step).
- `getParamDescriptors(name: string): (Thing<name> | Thing<paramdescriptor>)[]` — 
- `callFunction(task: Task, name: string, entry: StackEntry): void` — 
- `operator(name: string, state: StackEntry): Thing` — 
- `getApply(functorType: string | ThingType): CustomApplicator | null` — 

## `Task`
Represents a running Backolon evaluation task.
```ts
constructor(priority: number, scheduler: Scheduler, code: Thing, env: Thing<env> | Thing<nil>): Task
```
**Properties:**
- `suspended: boolean` — Whether this task is currently suspended (e.g. waiting for a promise to resolve).
If true, the scheduler will not run this task until it is resumed by setting suspended to false.
- `stack: readonly StackEntry[]` — 
- `result: Thing<string | ThingType> | null` — Represents the result of the last evaluated expression, used for returning values to whatever started this task.
- `priority: number` — 
- `scheduler: Scheduler` — 
**Methods:**
- `step(): boolean` — Try to take a single evaluation step in this task. Returns true if the task made progress (e.g. evaluated something or updated its state), or false if the task is currently suspended or has finished execution.
If the task throws an error during evaluation, the task may end up in an undefined state.
- `continuation(loc: LocationTrace): Thing<continuation>` — Return a new thing representing the current continuation at this point in evaluation,
which when called will return to this point with the given value as the result of the current expression.

The continuation will capture the entire stack, so it has infinite extent.
- `updateArgs(args: Thing<string | ThingType>[]): StackEntry` — Update the current stack entry with new arguments, returning the new stack entry.
- `updateCookie(index: number, state: number, data?: any): StackEntry` — Update the current stack entry with a new cookie value(s), returning the new stack entry.
The cookie is used to track internal evaluation state for constructs that call back into Backolon code,
so the Javascript implementation knows where it was and can resume evaluation from the correct point when the Backolon code returns.

The exact meaning of the cookie value(s) depends on the construct being evaluated.
- `updateFlags(toSet: number, toClear: number): StackEntry` — Updates the current stack entry with new flags, returning the new stack entry. toSet and toClear are bitmasks of StackFlag values to set and clear respectively.
- `updateEnv(newEnv: Thing<env>): StackEntry` — Updates the current stack entry with a new environment, returning the new stack entry. This is used when entering a new scope (e.g. injecting context-sensitive information).
- `enter(code: Thing, loc: LocationTrace, env: Thing<env> | Thing<nil>, args: readonly Thing<string | ThingType>[], name?: string | null): void` — Enters a new stack frame with the given code, location, environment, and arguments.
- `out(result?: Thing<string | ThingType>): StackEntry` — Exit the current stack frame, optionally with a result to return to the caller.
The result will be passed back to whatever got us here (e.g. the parent stack frame or the creator of the task).
- `dip(depth: number, cb: (state: StackEntry) => void): void` — Temporarily pop the given number of stack frames, call the callback with the new top of the stack, and then restore the popped stack frames.
This is used for things like variable declaration and assignment where we need to access the correct environment to put the variable in.

If depth is greater than or equal to the current stack size, the callback will be called with the bottom of the stack (which is usually the global scope).
