import {
    EventDispatcher,
    insertionSort,
    LinkedList,
} from "@r47onfire/game-math";
import { CSTNode, Memo } from "@r47onfire/nebula";
import { StackTreeNode } from "../errors/compress";
import { backolonGrammar } from "../parser";
import { BackolonAuditEvents } from "./audit";
import { Env } from "./env";
import { Importer } from "./modules/importer";
import { Module } from "./modules/module";
import { TryCatchHandler } from "./trycatch";
import { Identifier, objectEntries } from "../utils";
import { Callable } from "../obj/monkey";

export type FormFunc = (
    task: Task,
    node: CSTNode<any>,
    env: Env,
    traceback: LinkedList<StackTreeNode>,
    handlers: LinkedList<TryCatchHandler>,
) => TaskGen<any>;

export type TaskGen<T> = Generator<PromiseLike<unknown>, T, any>;

/**
 * The Backolon thread dispatcher: on top of the base VM it keeps the module
 * cache, and the current grammar (if any).
 */
export class BackolonVM extends EventDispatcher<BackolonAuditEvents> {
    constructor(public importer: Importer) {
        super();
    }
    modules: Record<string, Module> = {};
    getModule(resolved: URL) {
        return this.modules[resolved.href];
    }
    createModule(name: URL, parent: Module | null) {
        return (this.modules[name.href] = new Module(name, parent));
    }
    /** List of tasks, sorted by priority. */
    tasks: Task[] = [];
    addTask(
        id: string,
        priority: number,
        form: CSTNode<any>,
        context: Record<Identifier, any>,
        exclusive = false,
    ): Task {
        if (exclusive) {
            const t2 = this.tasks.find((t) => t.id === id);
            if (t2) return t2;
        }
        const t = new Task(this, id, priority);
        const env = new Env([this.builtinsEnv], new Map(objectEntries(context)));
        t.gen = this.eval(form, t, env, null, null);
        this.tasks.push(t);
        insertionSort(this.tasks, (t1, t2) => t2.priority - t1.priority);
        return t;
    }
    eval(
        form: CSTNode<any>,
        task: Task,
        env: Env,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
    ) {
        return callValue(
            task.grammar[form.type]?.run,
            [task, form, env, traceback, handlers],
            true,
        );
    }
}

export class Task {
    grammar = backolonGrammar;
    memo: Memo<any> = {};
    gen!: TaskGen<any>;
    constructor(
        readonly vm: BackolonVM,
        readonly id: string,
        readonly priority: number,
    ) {}
}

export function callValue(
    handler: Callable | undefined,
    args: CSTNode<any>[],
    computed?: false,
): TaskGen<any>;
export function callValue(
    handler: Callable | undefined,
    args: any[],
    computed: true,
): TaskGen<any>;
export function* callValue(
    handler: Callable | undefined,
    args: any[],
    computed?: boolean,
) {
    // TODO: what to do here?
}
