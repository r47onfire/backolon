import { NamespaceResolver, Resurrect } from "resurrect-esm";
import { LocationTrace } from "../errors";
import { Thing, ThingType } from "../objects/thing";
import { parse } from "../parser/parse";
import { StackEntry, Task } from "./task";

export interface NativeFunctionDetails {
    params: (Thing<ThingType.paramdescriptor> | Thing<ThingType.name>)[],
    impl(task: Task, arg: StackEntry): void;
}

export class Scheduler {
    tasks: Task[] = [];
    private s: Resurrect;

    constructor(
        public apiFunctions: Record<string, NativeFunctionDetails>,
        public baseEnv: Thing<ThingType.env | ThingType.nil>,
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
        const task = new Task(priority, this, code, env ?? this.baseEnv);
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
    stepUntilSuspended() {
        do {
            var madeProgress = false;
            for (var i = 0; i < this.tasks.length; i++) {
                madeProgress ||= this.tasks[i]!.step();
            }
        } while (madeProgress);
    }
    getParamDescriptor(name: string, index: number): Thing<ThingType.paramdescriptor> | Thing<ThingType.name> {
        return this.apiFunctions[name]?.params[index]!;
    }
    callFunction(task: Task, name: string, entry: StackEntry) {
        return this.apiFunctions[name]!.impl(task, entry);
    }
}
