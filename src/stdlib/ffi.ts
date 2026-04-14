import { stringify } from "lib0/json";
import { RuntimeError } from "../errors";
import { fromJS, JSObjectType, toJS } from "../objects/js_interop";
import { boxNameSymbol, Thing, ThingType, typecheck, typeNameOf } from "../objects/thing";
import { NativeModule } from "./module";

/**
 * @file
 * @module FFI
 */

export function initFFI(mod: NativeModule) {
    // Entry point functions for common JS globals
    /**
     * A reference to the Javascript global object
     * @backolon
     * @value JS_GLOBAL
     * @type {JSObjectRef}
     */
    mod.defvar("JS_GLOBAL", fromJS(globalThis));

    /**
     * Construct the object (Javascript `new` operator)
     * @backolon
     * @function JS_new
     * @param {JSObjectRef} class - The class to construct
     * @param args... - constructor arguments
     * @returns {JSObjectRef}
     */
    mod.defun("JS_new", "class args...", (task, state) => {
        const ctor = state.argv[0]!;
        const args = state.argv.slice(1);

        if (!typecheck(JSObjectType)(ctor)) {
            throw new RuntimeError("first argument must be a JS object", ctor.loc);
        }
        const jsCtorFunc = toJS(ctor) as Function;
        const jsArgs = args.map(x => toJS(x));
        try {

            const result = Reflect.construct(jsCtorFunc, jsArgs);

            // We got an exotic constructor that returns a Promise...
            if (typeof result?.then === "function") {
                task.suspended = true;
                Promise.resolve(result)
                    .then(resolved => {
                        task.suspended = false;
                        task.out(fromJS(resolved, state.loc));
                    })
                    .catch(error => {
                        throw new RuntimeError(
                            `Constructor promise rejected: ${error instanceof Error ? error.message : String(error)}`,
                            state.loc,
                        );
                    });
                return;
            }

            task.out(fromJS(result, state.loc));
        } catch (e) {
            throw new RuntimeError(`JS constructor call failed: ${e}`, state.loc);
        }
    });

    // Property access overloads for js_object
    const ensure_name = (obj: Thing): string => {
        if (!typecheck(ThingType.string, ThingType.name, ThingType.number)(obj)) {
            throw new RuntimeError("cannot index a JS object with a " + typeNameOf(obj.t), obj.loc);
        }
        return String(obj.v);
    }
    /**
     * Get the key on the JSObject
     * @backolon
     * @syntax Subscript Object
     * @pattern object->"key"
     */
    mod.defoverload("getitem", [JSObjectType, null], (loc, argv) => {
        const obj = argv[0];
        const prop = ensure_name(argv[1]);
        const jsObj = obj.v;
        var value = jsObj[prop];
        if (typeof value === "function") {
            value = value.bind(jsObj);
        }
        return fromJS(value, loc);
    });
    /**
     * Set the key on the JSObject
     * @backolon
     * @syntax Assign to Object
     * @pattern object->"key" = value
     */
    mod.defoverload("setitem", [JSObjectType, null, null], (loc, argv) => {
        const jsObj = argv[0].v;
        const prop = ensure_name(argv[1]);
        const value = argv[2];
        try {
            jsObj[prop] = toJS(value);
            return value;
        } catch (e) {
            throw new RuntimeError(`failed to set property ${stringify(prop)} on JS object: ${e}`, loc);
        }
    });

    // Register applicator for calling js_object as a function
    const JSFunc_params = [new Thing(ThingType.paramdescriptor, [boxNameSymbol("arguments")], [false, true, false], "", "", "", mod.loc)];
    mod.defcall(JSObjectType, {
        params: () => JSFunc_params,
        call(task, functor, argv, callsite) {
            try {
                const jsFunc = functor.v;
                if (typeof jsFunc !== "function") {
                    throw new RuntimeError(`JS object is not callable: ${typeof jsFunc}`, functor.loc);
                }
                const jsArgs = argv.map(x => toJS(x));
                const result = jsFunc(...jsArgs);

                // Handle Promise results by suspending the task
                if (typeof result?.then === "function") {
                    task.suspended = true;
                    Promise.resolve(result)
                        .then(resolved => {
                            task.suspended = false;
                            task.out(fromJS(resolved, callsite.loc));
                        })
                        .catch(error => {
                            throw new RuntimeError(
                                `JS function promise rejected: ${String(error)}`,
                                callsite.loc,
                            );
                        });
                    return;
                }

                task.out(fromJS(result, callsite.loc));
            } catch (e) {
                throw new RuntimeError(`JS function call failed: ${e}`, callsite.loc);
            }
        }
    });
}
