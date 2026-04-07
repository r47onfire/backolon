import { boxNil, ThingType, typecheck } from "../objects/thing";
import { DEFAULT_UNPARSER } from "../parser/unparse";
import { NativeModule } from "./module";

export function misc(mod: NativeModule) {
    mod.defun("print", "values...", (task, state) => {
        if (!task.scheduler.printHook) {
            throw new Error("Can't use print without a print hook defined");
        }
        task.scheduler.printHook(state.argv.map(arg => typecheck(ThingType.string)(arg) ? arg.v : DEFAULT_UNPARSER.unparse(arg)).join(" "));
        task.out(boxNil());
    });
}
