import { RemovableSet } from "@r47onfire/game-math";
import { BNameError, BTypeError } from "../errors/classes";
import { Identifier } from "../utils";

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
    readonly watchers = new Map<Identifier, RemovableSet<unknown>>();
    constructor(
        /** Parent environments searched after this one, in order */
        readonly parents: readonly Env[] = [],
        /** The bindings defined directly in this scope */
        readonly bindings = new Map<Identifier, any>(),
    ) {}
    /** Returns the Env in which the given variable is defined. */
    find(name: Identifier): Env | undefined {
        if (Reflect.has(this.bindings, name)) {
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
    watch(name: Identifier, handler: unknown) {
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
     * Defines the value in this scope. Note: bailing on trying to reassign a
     * constant is not checked here. Only {@link unshadowables} is checked
     * here.
     */
    add(name: Identifier, value: any) {
        const exist = this.find(name);
        if (exist && exist.unshadowables.has(name))
            throw new BTypeError("backolon.variable.unshadowable", name);
        this.bindings.set(name, value);
    }
    /**
     * Defines the constant in this scope (always succeeds). Note: bailing on
     * trying to reassign a constant is not checked here.
     */
    addConst(name: Identifier, value: any) {
        this.add(name, value);
        this.constants.add(name);
    }
    /**
     * Defines the constant in this scope that can't be shadowed (always
     * succeeds). Note: Note: bailing on trying to reassign a constant is not
     * checked here.
     */
    addUnshadowableConst(name: Identifier, value: any) {
        this.addConst(name, value);
        this.unshadowables.add(name);
    }
    /**
     * Finds the scope in which this value is defined, and sets it there.
     * Returns the env it was just set in if it was set, false if it's a
     * constant and can't be changed, or undefined if it wasn't defined
     * anywhere.
     */
    set(name: Identifier, value: any) {
        const res = this.find(name);
        if (!res) throw new BNameError("backolon.variable.nonexistent", name);
        if (res.constants.has(name))
            throw new BTypeError("backolon.variable.readonly", name);
        res.bindings.set(name, value);
        // TODO: run watchers
    }
}

let n = 0;
/**
 * Returns a new unique symbol with a unique number description (to
 * differentiate it in printouts).
 */
export const gensym = (s = "$gensym") => Symbol(s + n++);
