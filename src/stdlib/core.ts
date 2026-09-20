import { B_atLocation, B_local, ErrnoCode, JEBError, makeJSFun, makeOpcode, NOTHING, Relation } from "@r47onfire/jeb";
import { ParseletContext } from "../parser";
import { Parselet } from "../parser/parselet";
import { Constraint } from "../parser/sort";
import { Module, MODULE_SELF } from "../runtime/module";
import { BackolonVM } from "../runtime/vm";

export const OP_setupModuleGlobals = makeOpcode(null, (vm: BackolonVM) => {
    const the_module: Module = vm.currentEnv.get(MODULE_SELF).or(() => {
        throw new JEBError(ErrnoCode.EPANIC, "not in a module??");
    });
    the_module.parselets = [
        P_comment,
        P_block_comment,
        P_identifier,
        // P_number,
        // P_string,
    ];
    the_module.constraints = [
        new Constraint(P_comment, Relation.EQUAL, P_block_comment),
    ];
}, null);

export const P_identifier = new Parselet(/[_\p{L}][_\p{L}\p{N}]*/u, makeJSFun("identifier", ["p"], (arg, vm: BackolonVM) => {
    const { first, skip, token: { location, text } } = arg.p as ParseletContext;
    if (!first) {
        skip.invoke(vm, 0);
        return NOTHING;
    }
    vm.tag(location, "name");
    return [B_atLocation, location, [B_local, text]];
}, ""));

const comment = (arg: { p: unknown }, vm: BackolonVM) => {
    const { discard, token: { location } } = arg.p as ParseletContext;
    vm.tag(location, "comment");
    discard.invoke(vm, 0);
    return NOTHING;
}
export const P_comment = new Parselet(/##[^\n]*/, makeJSFun("lineComment", ["p"], comment, ""));
export const P_block_comment = new Parselet(/(#{3,}).+?\1/, makeJSFun("blockComment", ["p"], comment, ""));


