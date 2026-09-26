import { B_atLocation, B_begin, B_let_in, B_div, B_local, B_minus, B_mul, B_plus, B_pow, B_set, Continuation, ErrnoCode, JEBError, JSFun, Location, makeJSFun, makeOpcode, NOTHING, OP_apply, popData, pushCommand, pushData, Relation } from "@r47onfire/jeb";
import { NO_MATCH, ParseletContext } from "../parser";
import { stripInlinedFunctions } from "../parser/debug";
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
        P_let,
        P_identifier,
        P_number,
        P_leading_space,
        P_infix_space,
        P_leftParen,
        P_add,
        P_sub,
        P_mul,
        P_div,
        P_pow,
        P_assign,
        P_newline,
        P_semicolon,
    ];
    the_module.constraints = [

        new Constraint(P_comment, Relation.EQUAL, P_block_comment),

        new Constraint(P_identifier, Relation.GREATER, P_comment),

        new Constraint(P_identifier, Relation.EQUAL, P_number),
        new Constraint(P_leftParen, Relation.EQUAL, P_identifier),

        // alphabetic keywords must come before identifier
        new Constraint(P_let, Relation.GREATER, P_identifier),

        new Constraint(P_add, Relation.EQUAL, P_sub),
        new Constraint(P_mul, Relation.EQUAL, P_div),
        new Constraint(P_pow, Relation.GREATER, P_mul),
        new Constraint(P_mul, Relation.GREATER, P_add),
        new Constraint(P_add, Relation.GREATER, P_assign),

        new Constraint(P_assign, Relation.GREATER, P_infix_space),
        new Constraint(P_infix_space, Relation.GREATER, P_semicolon),
        new Constraint(P_newline, Relation.EQUAL, P_semicolon),
        new Constraint(P_newline, Relation.EQUAL, P_leading_space),
    ];
}, null);

// MARK: comments
export const P_comment = new Parselet("##", makeJSFun("lineComment", ["p"], ({ p }, vm: BackolonVM) => {
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

export const P_block_comment = new Parselet("##[[", makeJSFun("blockComment", ["p"], ({ p }, vm: BackolonVM) => {
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
    console.log("number", text);
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

const OP_maybeFinishCall = makeOpcode(null, (vm: BackolonVM, { 0: callee, 1: args, 2: parse, 3: explicit }: [any, any[], ParseletContext["parse"], boolean]) => {
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
            pushCommand(vm, OP_apply, [true, explicit, false], undefined, false, true);
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
        pushCommand(vm, OP_apply, [true, explicit, false], undefined, false, true);
        return;
    }
    if (explicit) {
        if (!p.test(")")) throw new JEBError(ErrnoCode.ESYNTAX, "expected )");
        vm.parser = p.advance(1);
    }
    pushData(vm, stripLocalInCall([callee, ...nextArgs]));
}, null);

const OP_finishGroup = makeOpcode(null, (vm: BackolonVM, { 0: savedB }: [readonly Parselet[]]) => {
    const expression = popData(vm);
    if (!vm.parser!.test(")")) throw new JEBError(ErrnoCode.ESYNTAX, "expected )");
    vm.parser = vm.parser!.advance(1);
    // Restore the T-list saved by P_leftParen.
    if (savedB) vm.parser = vm.parser.withTParselets(savedB);
    pushData(vm, expression);
}, null);

const parseCallArguments = (vm: BackolonVM, { left, parse }: ParseletContext, explicit: boolean): typeof NOTHING => {
    pushCommand(vm, OP_maybeFinishCall, left, [], parse, explicit);
    pushData(vm, parse);
    pushCommand(vm, OP_apply, [true, explicit, false], undefined, false, true);
    return NOTHING;
};

export const P_newline = new Parselet(/\n\s*/, makeJSFun("newline", ["p"], ({ p }, vm: BackolonVM) => {
    const { first, discard, skip } = p as ParseletContext;
    (first ? discard : skip).invoke(vm, 0);
    return NOTHING;
}, ""));

export const P_semicolon = new Parselet(";", makeJSFun("semicolon", ["p"], ({ p }, vm: BackolonVM) => {
    const context = p as ParseletContext;
    const { first, discard, skip, left, parseDepth, parse, token: { location } } = context;
    if (first) {
        // `;` never starts an expression
        discard.invoke(vm, 0);
        return NOTHING;
    }
    if (parseDepth === 0) {
        // if at top level, hide, so that the parser returns NO_MATCH
        // and the expression is forced to end
        skip.invoke(vm, 0);
        return NOTHING;
    }
    // Inside an expression: `;` is a normal infix operator (like `+`/`**`)
    // with the lowest precedence, building a B_begin sequence.
    // TODO: B_begin can be flattened (e.g. x;y;z parses as [begin, x, [begin, y, z]] but it can be changed to [begin, x, y, z])
    vm.tag(location, "operator");
    pushCommand(vm, OP_finishInfix, left, B_begin, location);
    pushCommand(vm, OP_apply, [false], undefined, false, true);
    pushData(vm, parse);
    return NOTHING;
}, ""), true);

/**
 * Maximal-munch scan for the token starting at the current parser index.
 * Returns true when that token belongs to an infix-only parselet (a binary
 * operator), which can never begin an implicit-call argument.
 */
const nextTokenIsInfixOnlyOperator = (vm: BackolonVM): boolean => {
    const parser = vm.parser!;
    let best: Parselet | null = null;
    let bestLength = -1;
    for (const p of parser.parselets) {
        const m = parser.test(p.prefix);
        if (m && m[0].length > bestLength) {
            best = p;
            bestLength = m[0].length;
        }
    }
    return best !== null && best.infixOnly;
};

export const P_infix_space = new Parselet(/((?!\n)\s)+/, makeJSFun("infixSpace", ["p"], ({ p }, vm: BackolonVM) => {
    const context = p as ParseletContext;
    const { first, skip, left } = context;
    if (first) {
        skip.invoke(vm, 0);
        return NOTHING;
    }
    console.log("infix space");
    // yield to explicit call
    if (vm.parser!.test("(")) return left;
    // TODO: remove this infixOnly kludge
    if (nextTokenIsInfixOnlyOperator(vm)) return left;
    const parser = vm.parser!;
    // TODO: currently the T-list is not used so this doesn't do anything
    if (parser.tParselets.some(p => parser.test(p.prefix))) return left;
    return parseCallArguments(vm, context, false);
}, ""));

export const P_leading_space = new Parselet(/((?!\n)\s)+/, makeJSFun("leadingSpace", ["p"], ({ p }, vm: BackolonVM) => {
    const { first, discard, skip, left } = p as ParseletContext;
    if (first) {
        discard.invoke(vm, 0);
        return NOTHING;
    }
    // In infix position: if the next token is an operator, yield left.
    // TODO: removing this breaks precedence. Why? It's a kludge, so it has to be removed.
    if (nextTokenIsInfixOnlyOperator(vm)) return left;
    skip.invoke(vm, 0);
    console.log("leading space");
    return NOTHING;
}, ""));

// MARK: let
const OP_finishLet = makeOpcode(null, (vm: BackolonVM, { 0: name, 1: location }: [string, Location]) => {
    const value = popData(vm);
    if (value === NO_MATCH) throw new JEBError(ErrnoCode.ESYNTAX, "invalid let binding");
    pushData(vm, [B_atLocation, location, [B_let_in, name, value]]);
}, null);

export const P_let = new Parselet("let", makeJSFun("let", ["p"], ({ p }, vm: BackolonVM) => {
    const context = p as ParseletContext;
    const { first, skip, parse, token: { location } } = context;
    if (!first) {
        skip.invoke(vm, 0);
        return NOTHING;
    }
    var parser = vm.parser!;
    // TODO: rewrite this header to parse as a normal function call, then add an opcode
    // TODO: that expects each argument to be a B_set call and rewrites it into a B_let_in form
    // TODO: when the T-list is working, then add the in...end block afterwards and transform it
    // TODO: into a normal B_let call
    // Consume spaces and the identifier.
    const space = parser.test(/((?!\n)\s)+/);
    if (space) parser = vm.parser = parser.advance(space[0].length);
    const nameMatch = parser.test(/[_\p{L}][_\p{L}\p{N}]*/u);
    if (!nameMatch) throw new JEBError(ErrnoCode.ESYNTAX, "invalid let binding");
    const name = nameMatch[0];
    // `in` and `end` are usable as binding names (they're semi-hard, not hard).
    parser = vm.parser = parser.advance(name.length);
    // Expect `=`.
    const space2 = parser.test(/((?!\n)\s)*/);
    if (space2) parser = vm.parser = parser.advance(space2[0].length);
    if (!parser.test("=")) throw new JEBError(ErrnoCode.ESYNTAX, "invalid let binding");
    parser = vm.parser = parser.advance(1);
    // Parse the value, then build the binding.
    pushCommand(vm, OP_finishLet, name, location);
    pushData(vm, parse);
    pushCommand(vm, OP_apply, [false], undefined, false, true);
    return NOTHING;
}, ""));

export const P_leftParen = new Parselet("(", makeJSFun("call", ["p"], ({ p }, vm: BackolonVM) => {
    const context = p as ParseletContext;
    const { first, parse, left } = context;
    if (first) {
        // hide the T-list from the inner parse since the parenthesis
        // block has to end before the outer construct (which set the T-list)
        // can end
        const savedB = vm.parser!.tParselets;
        vm.parser = vm.parser!.clearTParselets();
        pushCommand(vm, OP_finishGroup, savedB);
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
    const d = popData(vm);
    console.log(operator.name.toString() + " parse done, right=" + stripInlinedFunctions(d).toString());
    pushData(vm, d === NO_MATCH ? left : [B_atLocation, location, [operator, left, d]]);
}, null);

const makeBinaryInfixOperator = (operator: JSFun<BackolonVM, any>, name: string, rightAssociative = false) => new Parselet(name, makeJSFun(name, ["p"], ({ p }, vm: BackolonVM) => {
    const context = p as ParseletContext;
    const { first, left, token: { location }, skip, parse } = context;
    if (first) {
        skip.invoke(vm, 0);
        return NOTHING;
    }
    vm.tag(location, "operator");
    console.log(`${operator.name.toString()} parse: left=${stripInlinedFunctions(left).toString()}\n  ${vm.parser!.source.code}\n  ${" ".repeat(vm.parser!.index)}^\n`);
    pushCommand(vm, OP_finishInfix, left, operator, location);
    pushCommand(vm, OP_apply, [rightAssociative], undefined, false, true);
    pushData(vm, parse);
    return NOTHING;
}, ""), true); // TODO: remove the infixOnly hack

export const P_add = makeBinaryInfixOperator(B_plus, "+");
export const P_sub = makeBinaryInfixOperator(B_minus, "-");
export const P_mul = makeBinaryInfixOperator(B_mul, "*");
export const P_div = makeBinaryInfixOperator(B_div, "/");
export const P_pow = makeBinaryInfixOperator(B_pow, "**", true);
export const P_assign = makeBinaryInfixOperator(B_set, "=", true);

const OP_augAssign = makeOpcode(null, (vm: BackolonVM, { 0: text }: [string]) => {
    const data = popData(vm);
    console.log(data, text);
    pushData(vm, data);
}, null);
