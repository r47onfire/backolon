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
        P_newline,
        // P_number,
        // P_string,
    ];
    the_module.constraints = [
        new Constraint(P_comment, Relation.EQUAL, P_block_comment),
    ];
}, null);

export const P_identifier = new Parselet(/[_\p{L}][_\p{L}\p{N}]*/u, makeJSFun("identifier", ["p"], ({ p }, vm: BackolonVM) => {
    const { first, skip, token: { location, text } } = p as ParseletContext;
    if (!first) {
        skip.invoke(vm, 0);
        return NOTHING;
    }
    vm.tag(location, "name");
    return [B_atLocation, location, [B_local, text]];
}, ""));
export const P_comment = new Parselet(/##/, makeJSFun("lineComment", ["p"], ({ p }, vm: BackolonVM) => {
    const { discard, token: { location } } = p as ParseletContext;
    vm.tag(location, "comment");
    const p2 = vm.parser!;
    const rest = p2.test(/[^\n]+/);
    if (rest) {
        vm.tag(p2.commitToken(vm, rest[0]).location, "comment");
        vm.parser = p2.advance(rest[0].length);
    }
    discard.invoke(vm, 0);
    return NOTHING;
}, ""));
export const P_block_comment = new Parselet(/##\[\[/, makeJSFun("blockComment", ["p"], ({ p }, vm: BackolonVM) => {
    throw p;
}, ""));

export const P_newline = new Parselet(/\n\s*/, makeJSFun("newline", ["p"], ({ p }, vm: BackolonVM) => {
    const { skip, discard, first } = p as ParseletContext;
    (first ? discard : skip).invoke(vm, 0);
    return NOTHING;
}, ""));
