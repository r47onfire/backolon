import { NamespaceResolver, Resurrect } from "resurrect-esm";
import { LocationTrace } from "../errors";
import { newEmptyMap } from "../objects/map";
import { boxList, Thing, ThingType } from "../objects/thing";
import { parse } from "../parser/parse";
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
        public apiFunctions: Record<string, NativeFunctionDetails>,
        public baseEnv: Thing<ThingType.env | ThingType.nil>,
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
    startTask(priority: number, code: string, env: Thing<ThingType.env | ThingType.nil> | null, filename: URL): Task;
    startTask(priority: number, code: Thing, env?: Thing<ThingType.env | ThingType.nil>): Task;
    startTask(priority: number, code: string | Thing, env?: Thing<ThingType.env | ThingType.nil> | null, filename?: URL): Task {
        if (typeof code === "string") code = parse(code, filename);
        const loc = code.loc;
        const task = new Task(priority, this, code, newEnv(newEmptyMap(loc), boxList([], loc), loc, env ?? this.baseEnv));
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
        const func = this.apiFunctions[name];
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
}
