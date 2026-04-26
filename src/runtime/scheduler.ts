import { stringify } from "lib0/json";
import { NamespaceResolver, Resurrect } from "resurrect-esm";
import { LocationTrace, RuntimeError } from "../errors";
import { newEmptyMap } from "../objects/map";
import { boxList, Thing, ThingType, typecheck, typeNameOf } from "../objects/thing";
import { parse } from "../parser/parse";
import { NativeModule, OperatorOverload } from "../stdlib/module";
import { newEnv } from "./env";
import { StackFrame, Task } from "./task";
import { compress, decompress } from "lz-string";

/**
 * Shape of native function metadata registered with the Backolon scheduler.
 */
export interface NativeFunctionDetails {
    params: (Thing<ThingType.paramdescriptor> | Thing<ThingType.name>)[],
    impl(task: Task, state: StackFrame): void;
}

/**
 * Backolon task scheduler responsible for running code and native functions.
 */
export class Scheduler {
    /**
     * List of currently active tasks, sorted by priority (lowest first). Tasks that have finished executing but haven't been removed from the list yet will have an empty stack.
     */
    tasks: Task[] = [];
    private s: Resurrect;
    /**
     * Maximum allowed stack length before a task throws a recursion error.
     * Backolon uses its own stack and not the JavaScript call stack, so this serves
     * to prevent out-of-memory errors.
     */
    recursionLimit = 1000;

    constructor(
        /**
         * List of builtin modules available to tasks run by this scheduler.
         * Each module's environment (native functions, patterns, variables) will be included
         * in the search path for new tasks.
         */
        public builtins: [NativeModule, ...NativeModule[]],
        /**
         * Called with a string whenever a task calls the Backolon `print` function.
         * Can be used to capture printed output in a custom environment (e.g. a web REPL).
         */
        public printHook?: (x: string) => void,
        /**
         * Names of special classes to preserve when serializing the scheduler's state with `serializeTasks` and `loadFromSerialized`.
         * See the Resurrect.js library documentation for details.
         */
        customNames: ConstructorParameters<typeof NamespaceResolver>[0] = {}
    ) {
        this.s = new Resurrect({
            cleanup: true,
            resolver: new NamespaceResolver({
                ...customNames,
                Task,
                Thing,
                LocationTrace,
                StackFrame,
            }),
        });
    }
    /**
     * Start a new task with the given code and environment.
     * The code can be provided as a string (in which case it will be parsed)
     * or as a pre-parsed Thing. The environment is a list of env Things, which will be searched in order when looking up variables;
     * if null or omitted, the environments of all builtin modules will be used.
     *
     * The new Task will have its top-level block in a *new* environment that has the provided envs
     * as parents, so changes to the top-level block's environment won't affect the provided envs or other tasks that share those envs.
     */
    startTask(priority: number, code: string, envs: (Thing<ThingType.env> | Thing<ThingType.nil>)[] | null, filename: URL): Task;
    startTask(priority: number, code: Thing, envs?: (Thing<ThingType.env> | Thing<ThingType.nil>)[]): Task;
    startTask(priority: number, code: string | Thing, envs?: (Thing<ThingType.env> | Thing<ThingType.nil>)[] | null, filename?: URL): Task {
        if (typeof code === "string") code = parse(code, filename);
        const loc = code.loc;
        return this.startTaskRaw(priority, code, newEnv(newEmptyMap(loc), boxList([], loc), loc, envs || this.builtins.map(mod => mod.env)));
    }
    startTaskRaw(priority: number, code: Thing, env: Thing<ThingType.env> | Thing<ThingType.nil>): Task {
        const task = new Task(priority, this, code, env);
        this.tasks.push(task);
        this.t();
        return task;
    }
    private t() {
        this.tasks.sort((t1, t2) => t1.priority - t2.priority);
    }
    /**
     * Dumps the state of all tasks into a string, which can later be loaded with `loadFromSerialized` to restore the tasks and their states.
     */
    serializeTasks(): string {
        return compress(this.s.stringify(this.tasks, (k, v) => k === "scheduler" && (v === this) ? undefined : v));
    }
    /**
     * Deserializes a string produced by `serializeTasks` and adds the resulting tasks to the scheduler.
     * Note that the deserialized tasks will share the same Scheduler instance (this) as each other and any tasks that were already in the scheduler,
     * but will not share any state with tasks that were already in the scheduler before (e.g. they won't share environments or variables).
     */
    loadFromSerialized(str: string): void {
        this.tasks.push(...this.s.resurrect(decompress(str)).map((t: Task) => (t.scheduler = this, t)));
    }
    /**
     * Run tasks until all tasks are suspended or complete or the optional maxSteps limit is reached (-1 or undefined means no limit).
     * Returns true if any progress was made (i.e. any task executed at least one step).
     */
    stepUntilSuspended(maxSteps: number = -1) {
        var madeAnyProgress = false;
        do {
            var madeProgressThisRound = false;
            for (var i = 0; i < this.tasks.length; i++) {
                madeProgressThisRound ||= this.tasks[i]!.step();
            }
            madeAnyProgress ||= madeProgressThisRound;
        } while (madeProgressThisRound && --maxSteps !== 0);
        return madeAnyProgress;
    }
    private f(name: string): NativeFunctionDetails {
        const func = this.builtins.find(mod => name in mod.funcs)?.funcs[name];
        if (!func) {
            throw new Error(`api function ${name} requested but not implemented!`);
        }
        return func;
    }
    getParamDescriptors(name: string): (Thing<ThingType.paramdescriptor> | Thing<ThingType.name>)[] {
        return this.f(name).params ?? [];
    }
    callFunction(task: Task, name: string, frame: StackFrame) {
        const result = this.f(name).impl(task, frame);
        if (result !== undefined) {
            console.warn(`Native function implementation ${name} should call task.out(result), not return result`);
            task.out(result);
        }
    }
    operator(name: string, state: StackFrame): Thing {
        const argv = state.argv;
        const argc = argv.length;
        const loc = argv[0]!.loc;
        var bestOverload: OperatorOverload["cb"] | undefined = undefined, bestScore = -1;
        for (var module of this.builtins) {
            const overloads = module.ops[name]?.[argc];
            if (overloads) outer: for (var { types, cb } of overloads) {
                var score = 0;
                for (var i = 0; i < types.length; i++) {
                    const gottenType = argv[i]!.t;
                    const requestedType = types[i]!;
                    if (requestedType === null) score += 1;
                    else if (requestedType === gottenType) score += 3;
                    else continue outer;
                }
                if (score > bestScore) {
                    bestOverload = cb;
                    bestScore = score;
                }
            }
        }
        if (!bestOverload)
            throw new RuntimeError(`No overload exists for operator ${stringify(name)} with argument types ${argv.map(t => stringify(typeNameOf(t.t))).join(", ")}`, loc);
        return bestOverload(loc, argv);
    }
    getApply(functorType: ThingType | string) {
        for (var module of this.builtins) {
            const applicator = module.applicators[functorType];
            if (applicator) return applicator;
        }
        return null;
    }
}
