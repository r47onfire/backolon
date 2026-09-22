import { B_atLocation, B_div, B_local, B_minus, B_mul, B_plus, B_pow, B_set, ErrnoCode, JEBError, JSFun, Location, makeJSFun, makeOpcode, NOTHING, OP_apply, popData, pushCommand, pushData, Relation } from "@r47onfire/jeb";
import { NO_MATCH, ParseletContext } from "../parser";
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
        P_number,
        P_add,
        P_sub,
        P_mul,
        P_div,
        P_pow,
        P_assign,
        P_space,
        P_leftParen,
        P_newline,
        P_semicolon,
    ];
    the_module.constraints = [
        new Constraint(P_comment, Relation.EQUAL, P_block_comment),

        new Constraint(P_identifier, Relation.GREATER, P_comment),
        new Constraint(P_space, Relation.GREATER, P_newline),
        new Constraint(P_newline, Relation.EQUAL, P_semicolon),

        new Constraint(P_identifier, Relation.EQUAL, P_number),
        new Constraint(P_leftParen, Relation.EQUAL, P_identifier),

        new Constraint(P_space, Relation.GREATER, P_pow),

        new Constraint(P_add, Relation.GREATER, P_assign),
        new Constraint(P_add, Relation.EQUAL, P_sub),
        new Constraint(P_mul, Relation.GREATER, P_add),
        new Constraint(P_mul, Relation.EQUAL, P_div),
        new Constraint(P_pow, Relation.GREATER, P_mul),
    ];
}, null);

// MARK: comments
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
    throw Error("block comment TODO");
}, ""));

// MARK: atoms
export const P_identifier = new Parselet(/[_\p{L}][_\p{L}\p{N}]*/u, makeJSFun("identifier", ["p"], ({ p }, vm: BackolonVM) => {
    const { first, skip, token: { location, text } } = p as ParseletContext;
    if (!first) {
        skip.invoke(vm, 0);
        return NOTHING;
    }
    vm.tag(location, "name");
    return [B_atLocation, location, [B_local, text]];
}, ""));
export const P_number = new Parselet(/(\d+(\.\d*)?|\.\d+)(e\d+)?/i, makeJSFun("number", ["p"], ({ p }, vm: BackolonVM) => {
    const { first, skip, token: { location, text } } = p as ParseletContext;
    if (!first) {
        skip.invoke(vm, 0);
        return NOTHING;
    }
    vm.tag(location, "number");
    return [B_atLocation, location, Number(text)];
}, ""));

// MARK: function calling mess

export const getLocal = (expr: any): [Location | undefined, any] | undefined => {
    if (expr?.[0] === B_atLocation) {
        const { 1: real } = getLocal(expr[2]) ?? [];
        return [expr[1], real];
    }
    if (expr?.[0] === B_local) {
        return [undefined, expr[1]];
    }
    return undefined;
}

export const stripLocalInCall = (call: any) => {
    const { 0: location, 1: local } = getLocal(call?.[0]) ?? [];
    if (local) {
        if (location) return [B_atLocation, location, [local, ...call.slice(1)]];
    }
    return call;
}

const OP_maybeFinishCall = makeOpcode(null, (vm: BackolonVM, { 0: callee, 1: args, 2: parse, 3: explicit }: [any, any[], any, boolean]) => {
    const argument = popData(vm);
    var p = vm.parser!;
    if (argument === NO_MATCH) {
        if (p.test(",")) {
            // blank = undefined
            p = vm.parser = p.advance(1);
            if (explicit && p.test(")")) {
                vm.parser = p.advance(1);
                pushData(vm, stripLocalInCall([callee, ...args, undefined]));
                return;
            }
            pushCommand(vm, OP_maybeFinishCall, callee, args.concat([undefined]), parse, explicit);
            pushData(vm, parse);
            pushCommand(vm, OP_apply, [true, true, false], undefined, false, true);
            return;
        }
        if (explicit) throw new JEBError(ErrnoCode.ESYNTAX, "expected expression");
        // if there's no arguments it means it's trailing space on the line, ignore it
        pushData(vm, args.length === 0 ? callee : stripLocalInCall([callee, ...args]));
        return;
    }
    const nextArgs = args.concat([argument]);
    if (p.test(",")) {
        p = vm.parser = p.advance(1);
        if (explicit && p.test(")")) {
            vm.parser = p.advance(1);
            pushData(vm, stripLocalInCall([callee, ...nextArgs]));
            return;
        }
        pushCommand(vm, OP_maybeFinishCall, callee, nextArgs, parse, explicit);
        pushData(vm, parse);
        pushCommand(vm, OP_apply, [true, true, false], undefined, false, true);
        return;
    }
    if (explicit) {
        if (!p.test(")")) throw new JEBError(ErrnoCode.ESYNTAX, "expected )");
        vm.parser = p.advance(1);
    }
    pushData(vm, stripLocalInCall([callee, ...nextArgs]));
}, null);

const OP_finishGroup = makeOpcode(null, (vm: BackolonVM) => {
    const expression = popData(vm);
    if (!vm.parser!.test(")")) throw new JEBError(ErrnoCode.ESYNTAX, "expected )");
    vm.parser = vm.parser!.advance(1);
    pushData(vm, expression);
}, null);

const parseCallArguments = (vm: BackolonVM, context: ParseletContext, explicit: boolean): typeof NOTHING => {
    pushCommand(vm, OP_maybeFinishCall, context.left, [], context.parse, explicit);
    pushData(vm, context.parse);
    pushCommand(vm, OP_apply, [true, true, false], undefined, false, true);
    return NOTHING;
};

export const P_newline = new Parselet(/\n\s*/, makeJSFun("newline", ["p"], ({ p }, vm: BackolonVM) => {
    const { first, discard, skip } = p as ParseletContext;
    (first ? discard : skip).invoke(vm, 0);
    return NOTHING;
}, ""));

export const P_semicolon = new Parselet(";", makeJSFun("semicolon", ["p"], ({ p }, vm: BackolonVM) => {
    const { first, discard, skip } = p as ParseletContext;
    (first ? discard : skip).invoke(vm, 0);
    return NOTHING;
}, ""));

export const P_space = new Parselet(/((?!\n)\s)+/, makeJSFun("space", ["p"], ({ p }, vm: BackolonVM) => {
    const context = p as ParseletContext;
    const { first, discard, left } = context;
    if (first) {
        discard.invoke(vm, 0);
        return NOTHING;
    }
    // yield to explicit call
    if (vm.parser!.test("(")) return left;
    return parseCallArguments(vm, context, false);
}, ""));

export const P_leftParen = new Parselet("(", makeJSFun("call", ["p"], ({ p }, vm: BackolonVM) => {
    const context = p as ParseletContext;
    const { first, parse, left } = context;
    if (first) {
        pushCommand(vm, OP_finishGroup);
        pushData(vm, parse);
        pushCommand(vm, OP_apply, [true, true], undefined, false, true);
        return NOTHING;
    }
    if (vm.parser!.test(")")) {
        vm.parser = vm.parser!.advance(1);
        return stripLocalInCall([left]);
    }
    return parseCallArguments(vm, context, true);
}, ""));

// MARK: binary operators
const OP_finishInfix = makeOpcode(null, (vm: BackolonVM, { 0: left, 1: operator, 2: location }: [any, JSFun<any>, Location]) => {
    pushData(vm, [B_atLocation, location, [operator, left, popData(vm)]]);
}, null);
const makeBinaryInfixOperator = (operator: JSFun<BackolonVM, any>, name: string, rightAssociative = false) => new Parselet(name, makeJSFun(name, ["p"], ({ p }, vm: BackolonVM) => {
    const context = p as ParseletContext;
    const { first, left, token: { location }, skip, parse } = context;
    if (first) {
        skip.invoke(vm, 0);
        return NOTHING;
    }
    vm.tag(location, "operator");
    pushCommand(vm, OP_finishInfix, left, operator, location);
    pushCommand(vm, OP_apply, [rightAssociative], undefined, false, true);
    pushData(vm, parse);
    return NOTHING;
}, ""));

export const P_add = makeBinaryInfixOperator(B_plus, "+");
export const P_sub = makeBinaryInfixOperator(B_minus, "-");
export const P_mul = makeBinaryInfixOperator(B_mul, "*");
export const P_div = makeBinaryInfixOperator(B_div, "/");
export const P_pow = makeBinaryInfixOperator(B_pow, "**", true);

const OP_augAssign = makeOpcode(null, (vm: BackolonVM, { 0: text }: [string]) => {
    const data = popData(vm);
    console.log(data, text);
    pushData(vm, data);
}, null);
export const P_assign = makeBinaryInfixOperator(B_set, "=", true);

