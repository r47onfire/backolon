import { AccessType, Continuation, Env, ErrnoCode, JEBError, Location, makeJSFun, makeOpcode, NOTHING, OP_apply, OP_eval, OP_set_env, OP_shuffle, peekData, popData, pushCommand, pushData, VariableReference, withType } from "@r47onfire/jeb";
import { stringify } from "lib0/json";
import { SourceTracker } from "../runtime/importer";
import { BackolonVM } from "../runtime/vm";
import { forceStickyRegex, Parselet } from "./parselet";
import { Constraint, sortByConstraints } from "./sort";
import { Span } from "./span";
import { Module } from "../runtime/module";

export class Token {
    constructor(
        readonly text: string,
        readonly location: Location,
    ) { }
}



/**
 * Parser state; functionally immutable but contains some internal memoization
 * tables that are computed when needed.
 */
export class Parser {
    constructor(
        readonly source: SourceTracker,
        readonly index: number,
        readonly parselets: Parselet[],
        readonly constraints: readonly Constraint<Parselet>[],
    ) { }
    addParselet(parselet: Parselet): Parser {
        return new Parser(this.source, this.index, this.parselets.concat(parselet), this.constraints);
    }
    addConstraint(constraint: Constraint<Parselet>): Parser {
        return new Parser(this.source, this.index, this.parselets, this.constraints.concat(constraint));
    }
    isEOF() {
        return this.index >= this.source.code.length;
    }
    /** In sorted order longest tokens first */
    #munchTable!: [Parselet, Token][];
    #munched = false;
    #sorted = false;
    precedenceOf!: Map<Parselet, number>;
    #prepare(vm: BackolonVM) {
        const { parselets } = this;
        if (!this.#sorted) {
            this.precedenceOf = sortByConstraints(parselets, this.constraints);
            this.#sorted = true;
        }
        if (!this.#munched) {
            const t = this.#munchTable = [] as [Parselet, Token][];
            for (var i = 0; i < parselets.length; i++) {
                const p = parselets[i]!;
                const match = this.test(p.prefix);
                if (match) {
                    // TODO: how to clean out unused tokens???
                    t.push([p, this.commitToken(vm, match)]);
                }
            }
            t.sort((a, b) => b[1].text.length - a[1].text.length);
            this.#munched = true;
        }
    }
    commitToken(vm: BackolonVM, match: RegExpExecArray) {
        const { source, index } = this;
        const text = match[0];
        return new Token(text, vm.registerSpan(new Span(source.src, index, index + text.length)))
    }
    test(regex: RegExp | string) {
        regex = forceStickyRegex(regex);
        regex.lastIndex = this.index;
        return regex.exec(this.source.code);
    }
    peek(vm: BackolonVM, startIndex: number, maxPrecedence: number, orEqual: boolean): [parselet: Parselet, token: Token, nextIndex: number] | undefined {
        this.#prepare(vm);
        const tab = this.#munchTable;
        for (var i = startIndex; i < tab.length; i++) {
            const entry = tab[i]!;
            if (lte(this.precedenceOf.get(entry[0])!, maxPrecedence, orEqual)) return [...entry, i + 1];
        }
    }
    precedence() {
        return this.precedenceOf.get(this.#munchTable[0]![0])!;
    }
    advance(by: number) {
        const p = new Parser(this.source, this.index + by, this.parselets, this.constraints);
        if (this.#sorted) {
            p.#sorted = true;
            p.precedenceOf = this.precedenceOf;
        }
        return p;
    }
}

const lte = (a: number, b: number, orEqual: boolean) => a < b || (orEqual && a == b);

export const NO_MATCH = Symbol("__no_match__");
export const OP_runModule = makeOpcode(null, (vm: BackolonVM, { 0: st }: [SourceTracker]) => {
    if (vm.parser !== null) throw new JEBError(ErrnoCode.EALREADY, "cannot begin parsing while already parsing");
    vm.parser = new Parser(st, 0, [], []);
    pushCommand(vm, OP_moduleParseLoopTop);
}, null);

const OP_moduleParseLoopTop = makeOpcode(null, (vm: BackolonVM) => {
    const p = vm.parser!;
    if (p.isEOF()) {
        vm.parser = null;
        return;
    }
    // Parse one expression, eval it, discard top, and loop
    pushCommand(vm, OP_moduleParseLoopTop);
    pushCommand(vm, OP_shuffle, 1, []);
    pushCommand(vm, OP_eval, undefined);
    pushCommand(vm, OP_set_env, vm.currentEnv);
    pushCommand(vm, OP_parseone_result);
    pushCommand(vm, OP_parseone, -Infinity, false);
}, null);

const OP_parseone_result = makeOpcode(null, (vm: BackolonVM) => {
    console.log("parse one verify", peekData(vm));
    if (peekData(vm) === NO_MATCH) throw new JEBError(ErrnoCode.ESYNTAX, "unexpected character " + stringify(vm.parser!.test(/./)![0]));
}, null);

const OP_parseone = makeOpcode("parseOne", (vm: BackolonVM, { 0: precedence, 1: orEqual }: [number, boolean]) => {
    // set up left (first is implicit - left==NO_MATCH)
    const p = vm.parser!;
    pushData(vm, NO_MATCH);
    pushCommand(vm, OP_parserfindloop, p, 0, precedence, orEqual);
}, null);

const OP_parserfindloop = makeOpcode(null, (vm: BackolonVM, { 0: parser, 1: index, 2: precedence, 3: orEqual }: [Parser, number, number, boolean]) => {
    const chomp = parser.peek(vm, index, precedence, orEqual);
    if (chomp === undefined) {
        // don't continue main loop
        return;
    }
    const { 0: parselet, 1: token, 2: nextIndex } = chomp;
    // create "discard" continuation
    const discard = new Continuation(vm, [[OP_parserfindloop, parser, 0, precedence, orEqual]]);
    discard.state.resetParser = false;
    // create "skip" continuation = continue
    const skip = new Continuation(vm, [[OP_parserfindloop, parser, nextIndex, precedence, orEqual]]);    // continue main loop if precedence is high enough
    if (lte(precedence, parser.precedence(), orEqual)) {
        pushCommand(vm, OP_parseone, precedence, orEqual);
    }
    // try to call parse
    const left = popData(vm);
    vm.parser = parser.advance(token.text.length);
    pushData(vm, parselet.parse);
    pushCommand(vm, OP_apply, [makeParseletContext(left, parser.precedenceOf.get(parselet)!, token, nextIndex, skip, discard)], undefined, false, true);
}, null);

const makeParseletContext = (leftD: any, precedence: number, token: Token, nextIndex: number, skip: Continuation<BackolonVM>, discard: Continuation<BackolonVM>) => {
    const first = leftD === NO_MATCH, left = first ? undefined : leftD;
    return {
        left,
        first,
        token,
        skip,
        discard,
        parse: makeJSFun("parse", [["orEqual", false], ["reset", false]], (({ reset, orEqual }: { reset: boolean, orEqual: boolean }, vm: BackolonVM) => {
            pushCommand(vm, OP_parseone, reset ? -Infinity : precedence, orEqual);
            return NOTHING;
        }) as any, ""),
    }
}

const assertIsParsing = (vm: BackolonVM) => {
    if (!vm.parser) throw new JEBError(ErrnoCode.ESRCH, "not currently parsing");
}

const B_Parser_test = makeJSFun("sys.parser.test", ["what"], ({ what }, vm: BackolonVM) => {
    assertIsParsing(vm);
    return !!vm.parser!.test(withType(what, ["string", RegExp], "what"));
},
    `.func (parser.test what)
..param {string | RegExp} what - Pattern to test
..returns {boolean}
..throws ESRCH - if no parser is active
. Returns true if the pattern matches at the current parse position.`);

const B_Parser_expect = makeJSFun("sys.parser.expect", ["what"], ({ what }, vm: BackolonVM) => {
    assertIsParsing(vm);
    const p = vm.parser!
    const match = p.test(withType(what, ["string", RegExp], "what"));
    if (match) {
        const token = p.commitToken(vm, match);
        vm.parser = p.advance(token.text.length);
        return token;
    }
    throw new JEBError(ErrnoCode.ESYNTAX, `expected ${what} but got ${stringify(p.source.code[p.index])}`);
},
    `.func (parser.expect what)
..param {string | RegExp} what - Pattern to assert
..returns {Token}
..throws ESYNTAX - if the pattern doesn't match
..throws ESRCH - if no parser is active
. Asserts that the pattern matches at the current position, and then returns the token of what matched and advances the parser state.`);

const p2s = new WeakMap<Parser, symbol>();
const s2p = new WeakMap<symbol, Parser>();
const B_Parser_save = makeJSFun("sys.parser.save", [], (_, vm: BackolonVM) => {
    assertIsParsing(vm);
    return p2s.getOrInsertComputed(vm.parser!, p => {
        const sym = Symbol(p.source.src.href + " :: " + p.index);
        s2p.set(sym, p);
        return sym;
    });
},
    `.func (parser.save)
..returns {symbol}
..throws ESRCH - if no parser is active
. Returns a symbol that represents the state of the parser at this moment, for backtracking or span computing.`);
const B_Parser_restore = makeJSFun("sys.parser.restore", ["state"], ({ state }, vm: BackolonVM) => {
    assertIsParsing(vm);
    const pstate = s2p.get(withType(state, ["symbol"], "state"));
    if (!pstate) throw new JEBError(ErrnoCode.ENOENT, "unknown parser state");
    vm.parser = pstate;
},
    `.fun (parser.restore state)
..param {symbol} state
..throws ESRCH - if no parser is active
..throws ENOENT - if the state is not known
. Restores the parser state to the one named by the state symbol.`);

const B_Parser_isMatch = makeJSFun("sys.parser.isMatch", ["ast"], ({ ast }) => ast != NO_MATCH,
    `.func (parser.isMatch ast)
..param {any} ast
..returns {boolean}
. True if the AST given (from a recursive call to \`ctx.parse\`) is a valid AST or not.
If false, it means the parser could not parse anything.`);

const B_Parser_addSpan = makeJSFun("sys.parser.addSpan", ["start", "end"], ({ start, end }, vm: BackolonVM) => {
    assertIsParsing(vm);
    const start1 = s2p.get(withType(start, ["symbol"], "start"));
    const end1 = s2p.get(withType(end, ["symbol"], "end"));
    if (!start1) throw new JEBError(ErrnoCode.ENOENT, "unknown start parser state");
    if (!end1) throw new JEBError(ErrnoCode.ENOENT, "unknown end parser state");
    if (start1.source.src !== end1.source.src) throw new JEBError(ErrnoCode.ERANGE, "span can't start and end in two different files");
    if (start1.index < end1.index) throw new JEBError(ErrnoCode.EOVERFLOW, "span cannot have negative size");
    return vm.registerSpan(new Span(start1.source.src, start1.index, end1.index));
},
    `.func (parser.addSpan start end)
..param {symbol} start
..param {symbol} end
..returns {Location}
..throws ESRCH - if no parser is active
..throws ERANGE - if the \`start\` and \`end\` are in different files
..throws EOVERFLOW - if \`start\` is after \`end\`
. Registers and returns a \`Location\` span that goes between the positions registered in \`start\` and \`end\`.
The \`start\` and \`end\` symbols are returned by [[parser.save]]`);

export const create_SysParser = () => {
    const env = new Env;
    const m = new Module(env, new URL("builtin:sys.parser"), null);
    const export_ = (name: string, value: any) => {
        env.addConst(name, value);
        m.exports[name] = new VariableReference(AccessType.PROPERTY, env, name);
    }
    export_("test", B_Parser_test);
    export_("expect", B_Parser_expect);
    export_("save", B_Parser_save);
    export_("restore", B_Parser_restore);
    export_("isMatch", B_Parser_isMatch);
    export_("addSpan", B_Parser_addSpan);
    return m;
}
