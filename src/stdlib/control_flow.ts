import { NativeModule } from ".";
import { boxApply } from "../objects/thing";

export function control_flow(mod: NativeModule) {
    mod.defun("if", "cond @true @false", (task, state) => {
        const condition = state.argv[0]!;
        const ifTrue = state.argv[1]!;
        const ifFalse = state.argv[2]!;
        task.out();
        task.enter(boxApply(!!condition.v ? ifTrue : ifFalse, [], condition.loc), state.env);
    });
}
