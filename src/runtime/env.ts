import { type LinkedList, RemovableSet } from "@r47onfire/game-math";
import { BNameError, BTypeError } from "../errors/classes";
import type { StackTreeNode } from "../errors/compress";
import type { Identifier } from "../utils";
import { type Callable, type NO_ARGS_SIG } from "../obj";
import { callValue } from "./call";
import { type TryCatchHandler, handleError } from "./trycatch";
import type { Task, TaskGen } from "./vm";

/**
 * Key-value store for managing an environment, with inheritance from parent
 * environments.
 */
export class Env {
    /**
     * Names defined as constants in this scope; {@link set} refuses to change
     * them
     */
    readonly constants = new Set<Identifier>();
    /**
     * Names defined as unshadowable in this scope; {@link add} refuses to shadow
     * them
     */
    readonly unshadowables = new Set<Identifier>();
    /**
     * Handler blocks registered with {@link watch}, by variable name. The
     * handlers run (in the environment where the variable lives) whenever the
     * variable is assigned.
     */
    readonly watchers = new Map<
        Identifier,
        RemovableSet<Callable<typeof NO_ARGS_SIG, void>>
    >();
    constructor(
        /** Parent environments searched after this one, in order */
        readonly parents: readonly Env[] = [],
        /** The bindings defined directly in this scope */
        readonly bindings = new Map<Identifier, any>(),
    ) {}
    /** Returns the Env in which the given variable is defined. */
    find(name: Identifier): Env | undefined {
        if (this.bindings.has(name)) {
            return this;
        }
        const p = this.parents,
            len = p.length;
        for (let i = 0; i < len; i++) {
            const result = p[i]!.find(name);
            if (result) return result;
        }
    }
    /**
     * Registers a handler block to be run whenever the named variable is
     * assigned in this environment (reactive `always`-style watchers). Returns
     * a handle that removes the watcher when called.
     */
    watch(name: Identifier, handler: Callable<typeof NO_ARGS_SIG, void>) {
        return this.watchers
            .getOrInsertComputed(name, () => new RemovableSet())
            .push(handler);
    }
    /** Look up the value, and return its value and whether it exists or not */
    get(name: Identifier): [value: any, exists: boolean] {
        const e = this.find(name);
        if (!e) return [, false];
        return [e.bindings.get(name), true];
    }
    /**
     * Defines the value in this scope. Note: bailing on trying to redefine a
     * constant is not checked here. Only {@link unshadowables} is checked
     * here.
     */
    *add(
        name: Identifier,
        value: any,
        task: Task,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
    ) {
        const exist = this.find(name);
        if (exist && exist.unshadowables.has(name))
            return yield* handleError(
                task,
                this,
                traceback,
                handlers,
                new BTypeError("backolon.variable.unshadowable", name),
            );
        this.addFast(name, value);
    }
    /** Like {@link add}, but doesn't do any error checking at all. */
    addFast(name: Identifier, value: any) {
        this.bindings.set(name, value);
    }
    /**
     * Defines the constant in this scope (always succeeds). Note: bailing on
     * trying to reassign a constant is not checked here.
     */
    *addConst(
        name: Identifier,
        value: any,
        task: Task,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
    ) {
        yield* this.add(name, value, task, traceback, handlers);
        this.constants.add(name);
    }
    /** Like {@link addConst}, but doesn't do any error checking at all. */
    addConstFast(name: Identifier, value: any) {
        this.addFast(name, value);
        this.constants.add(name);
    }
    /**
     * Defines the constant in this scope that can't be shadowed (always
     * succeeds). Note: Note: bailing on trying to reassign a constant is not
     * checked here.
     */
    *addUnshadowableConst(
        name: Identifier,
        value: any,
        task: Task,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
    ) {
        yield* this.addConst(name, value, task, traceback, handlers);
        this.unshadowables.add(name);
    }
    /**
     * Like {@link addUnshadowableConst}, but doesn't do any error checking at
     * all.
     */
    addUnshadowableFast(name: Identifier, value: any) {
        this.addConstFast(name, value);
        this.unshadowables.add(name);
    }
    /**
     * Finds the scope in which this value is defined, and sets it there. If
     * there are watchers defined for the value, it runs those too.
     */
    *set(
        name: Identifier,
        value: any,
        task: Task,
        traceback: LinkedList<StackTreeNode>,
        handlers: LinkedList<TryCatchHandler>,
    ) {
        const res = this.find(name);
        if (!res)
            return yield* handleError(
                task,
                this,
                traceback,
                handlers,
                new BNameError("backolon.variable.nonexistent", name),
            );
        if (res.constants.has(name))
            return yield* handleError(
                task,
                this,
                traceback,
                handlers,
                new BTypeError("backolon.variable.readonly", name),
            );
        res.bindings.set(name, value);
        const w = this.watchers.get(name);
        if (w) {
            for (let watcher of w) {
                yield* callValue(
                    task,
                    this,
                    traceback,
                    handlers,
                    watcher,
                    undefined,
                    [],
                );
            }
        }
    }
}

let n = 0;
/**
 * Returns a new unique symbol with a unique number description (to
 * differentiate it in printouts).
 */
export const gensym = (s = "$gensym") => Symbol(s + n++);
