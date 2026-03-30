import { stringify } from "lib0/json";
import { NamespaceResolver, Resurrect } from "resurrect-esm";
import { LocationTrace, RuntimeError } from "../errors";
import { newEmptyMap } from "../objects/map";
import { boxList, Thing, ThingType, typecheck, typeNameOf } from "../objects/thing";
import { parse } from "../parser/parse";
import { NativeModule } from "../stdlib";
import { newEnv } from "./env";
import { StackEntry, Task } from "./task";

export interface NativeFunctionDetails {
    params: (Thing<ThingType.paramdescriptor> | Thing<ThingType.name>)[],
    impl(task: Task, arg: StackEntry): void;
}

export class Scheduler {
    tasks: Task[] = [];
    private s: Resurrect;
    recursionLimit = 10000;

    constructor(
        public builtins: [NativeModule, ...NativeModule[]],
        public printHook?: (x: string) => void,
        customNames: ConstructorParameters<typeof NamespaceResolver>[0] = {}
    ) {
        this.s = new Resurrect({
            cleanup: true,
            resolver: new NamespaceResolver({
                ...customNames,
                Task,
                Thing,
                LocationTrace,
                StackEntry,
            }),
        });
    }
    startTask(priority: number, code: string, envs: (Thing<ThingType.env> | Thing<ThingType.nil>)[] | null, filename: URL): Task;
    startTask(priority: number, code: Thing, envs?: (Thing<ThingType.env> | Thing<ThingType.nil>)[]): Task;
    startTask(priority: number, code: string | Thing, envs?: (Thing<ThingType.env> | Thing<ThingType.nil>)[] | null, filename?: URL): Task {
        if (typeof code === "string") code = parse(code, filename);
        const loc = code.loc;
        const task = new Task(priority, this, code, newEnv(newEmptyMap(loc), boxList([], loc), loc, envs || this.builtins.map(mod => mod.env)));
        this.tasks.push(task);
        this.t();
        return task;
    }
    private t() {
        this.tasks.sort((t1, t2) => t1.priority - t2.priority);
    }
    serializeTasks(): string {
        return this.s.stringify(this.tasks, (k, v) => k === "scheduler" && (v === this) ? undefined : v);
    }
    loadFromSerialized(str: string): void {
        this.tasks.push(...this.s.resurrect(str).map((t: Task) => (t.scheduler = this, t)));
    }
    stepUntilSuspended(maxSteps: number = -1) {
        do {
            var madeProgress = false;
            for (var i = 0; i < this.tasks.length; i++) {
                madeProgress ||= this.tasks[i]!.step();
            }
        } while (madeProgress && --maxSteps !== 0);
    }
    _getFunction(name: string): NativeFunctionDetails {
        const func = this.builtins.find(mod => name in mod.funcs)?.funcs[name];
        if (!func) {
            throw new Error(`api function ${name} requested but not implemented!`);
        }
        return func;
    }
    getParamDescriptors(name: string): (Thing<ThingType.paramdescriptor> | Thing<ThingType.name>)[] {
        return this._getFunction(name).params ?? [];
    }
    callFunction(task: Task, name: string, entry: StackEntry) {
        return this._getFunction(name).impl(task, entry);
    }
    operator(name: string, state: StackEntry): Thing {
        const argv = state.argv;
        const argc = argv.length;
        const loc = argv[0]!.loc;
        for (var module of this.builtins) {
            const overloads = module.ops[name]?.[argc];
            if (overloads) for (var overload of overloads) {
                const typeMatches = overload.types.every((t, i) => t === null ? true : typecheck(t)(argv[i]!));
                if (typeMatches) {
                    return overload.cb(loc, argv);
                }
            }
        }
        throw new RuntimeError(`No overload exists for operator ${stringify(name)} with arguments types ${argv.map(t => stringify(typeNameOf(t.t))).join(", ")}`, loc);
    }
}
