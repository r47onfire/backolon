import { AccessType, Continuation, ErrnoCode, JEBError, Location, makeJSFun, makeOpcode, NOTHING, OP_apply, OP_eval, OP_set_env, OP_shuffle, peekData, popData, pushCommand, pushData, VariableReference, withType } from "@r47onfire/jeb";
import { stringify } from "lib0/json";
import { SourceTracker } from "../runtime/importer";
import { type Module, MODULE_SELF } from "../runtime/module";
import { BackolonVM } from "../runtime/vm";
import { forceStickyRegex, Parselet } from "./parselet";
import { Constraint, sortByConstraints } from "./sort";
import { Span } from "./span";

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
    addParselets(...parselets: Parselet[]): Parser {
        return new Parser(this.source, this.index, this.parselets.concat(parselets), this.constraints);
    }
    addConstraints(...constraints: Constraint<Parselet>[]): Parser {
        return new Parser(this.source, this.index, this.parselets, this.constraints.concat(constraints));
    }
    isEOF() {
        return this.index >= this.source.code.length;
    }
    /** In sorted order longest tokens first */
    #munchTable!: [Parselet, string][];
    #munched = false;
    #sorted = false;
    precedenceOf!: Map<Parselet, number>;
    #prepare() {
        const parselets = this.parselets;
        if (!this.#sorted) {
            this.precedenceOf = sortByConstraints(parselets, this.constraints);
            this.#sorted = true;
        }
        if (!this.#munched) {
            const t = this.#munchTable = [] as [Parselet, string][];
            for (var i = 0; i < parselets.length; i++) {
                const p = parselets[i]!;
                const match = this.test(p.prefix);
                if (match) {
                    // TODO: how to avoid making unused tokens??
                    t.push([p, match[0]]);
                }
            }
            t.sort((a, b) => b[1].length - a[1].length);
            this.#munched = true;
        }
    }
    commitToken(vm: BackolonVM, text: string) {
        const { source, index } = this;
        return new Token(text, vm.registerSpan(new Span(source.src, index, index + text.length)))
    }
    test(regex: RegExp | string) {
        regex = forceStickyRegex(regex);
        regex.lastIndex = this.index;
        return regex.exec(this.source.code);
    }
    peek(vm: BackolonVM, startIndex: number, minPrecedence: number, orEqual: boolean): [parselet: Parselet, token: Token, nextIndex: number] | undefined {
        this.#prepare();
        const tab = this.#munchTable;
        for (var i = startIndex; i < tab.length; i++) {
            const entry = tab[i]!;
            if (lte(minPrecedence, this.precedenceOf.get(entry[0])!, orEqual)) return [entry[0], this.commitToken(vm, entry[1]), i + 1];
        }
    }
    precedence() {
        this.#prepare();
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
    const the_module: Module = vm.currentEnv.get(MODULE_SELF).or(() => {
        throw new JEBError(ErrnoCode.EPANIC, "not in a module??");
    });
    vm.parser = new Parser(st, 0, the_module.parselets, the_module.constraints);
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
    assertIsParsing(vm);
    if (peekData(vm) === NO_MATCH) {
        if (vm.parser!.isEOF()) {
            popData(vm);
            pushData(vm, null);
            return;
        }
        throw new JEBError(ErrnoCode.ESYNTAX, "unexpected character " + stringify(vm.parser!.test(/[\s\S]/)![0]));
    }
}, null);

const OP_parseone = makeOpcode("parseOne", (vm: BackolonVM, { 0: precedence, 1: orEqual }: [number, boolean]) => {
    assertIsParsing(vm);
    pushData(vm, NO_MATCH); // initial data
    pushCommand(vm, OP_parserfindloop, 0, precedence, orEqual);
}, null);

const OP_parserfindloop = makeOpcode(null, (vm: BackolonVM, { 0: index, 1: precedence, 2: orEqual }: [number, number, boolean]) => {
    const parser = vm.parser!;
    const chomp = parser.peek(vm, index, precedence, orEqual);
    if (chomp === undefined) {
        // don't continue main loop
        return;
    }
    const { 0: parselet, 1: token, 2: nextIndex } = chomp;
    // create "discard" continuation
    const discard = new Continuation(vm, [[OP_shuffle, 1, []], [OP_parserfindloop, 0, precedence, orEqual]]);
    discard.state.resetParser = false;
    // create "skip" continuation = continue
    const skip = new Continuation(vm, [[OP_shuffle, 1, []], [OP_parserfindloop, nextIndex, precedence, orEqual]]); // continue main loop if precedence is high enough
    if (lte(precedence, parser.precedence(), orEqual)) {
        pushCommand(vm, OP_parserfindloop, 0, precedence, orEqual);
    }
    // try to call parse
    const left = popData(vm);
    vm.parser = parser.advance(token.text.length);
    pushData(vm, parselet.parse);
    pushCommand(vm, OP_apply, [makeParseletContext(left, parser.precedenceOf.get(parselet)!, token, skip, discard)], undefined, false, true);
}, null);

const makeParseletContext = (leftD: any, precedence: number, token: Token, skip: Continuation<BackolonVM>, discard: Continuation<BackolonVM>) => {
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

export type ParseletContext = ReturnType<typeof makeParseletContext>;

const assertIsParsing = (vm: BackolonVM) => {
    if (!vm.parser) throw new JEBError(ErrnoCode.ESRCH, "not currently parsing");
}

export const B_Parser_test = makeJSFun("parser.test", ["what"], ({ what }, vm: BackolonVM) => {
    assertIsParsing(vm);
    return !!vm.parser!.test(withType(what, ["string", RegExp], "what"));
},
    `.func (parser.test what)
..param {string | RegExp} what - Pattern to test
..returns {boolean}
..throws ESRCH - if no parser is active
. Returns true if the pattern matches at the current parse position.`);

export const B_Parser_expect = makeJSFun("parser.expect", ["what"], ({ what }, vm: BackolonVM) => {
    assertIsParsing(vm);
    const p = vm.parser!
    const match = p.test(withType(what, ["string", RegExp], "what"));
    if (match) {
        const token = p.commitToken(vm, match[0]);
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
export const B_Parser_save = makeJSFun("parser.save", [], (_, vm: BackolonVM) => {
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
export const B_Parser_restore = makeJSFun("parser.restore", ["state"], ({ state }, vm: BackolonVM) => {
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

export const B_Parser_isMatch = makeJSFun("parser.isMatch", ["ast"], ({ ast }) => ast != NO_MATCH,
    `.func (parser.isMatch ast)
..param {any} ast
..returns {boolean}
. True if the AST given (from a recursive call to \`ctx.parse\`) is a valid AST or not.
If false, it means the parser could not parse anything.`);

export const B_Parser_addSpan = makeJSFun("parser.addSpan", ["start", "end"], ({ start, end }, vm: BackolonVM) => {
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
The \`start\` and \`end\` symbols are returned by [[parser.save]].`);

export const B_Parser_tag = makeJSFun("parser.tag", ["span", "tag"], ({ span, tag }, vm: BackolonVM) => {
    return vm.tag(withType(span, [Array], "span") as Location, withType(tag, ["string"], "tag"));
},
    `.func (parser.tag span tag)
..param {Location} span
..param {string} tag
. Adds the tag to the list of tags for all the characters in that span.`)

export const create_parser_module = (vm: BackolonVM) => {
    const m = vm.createModule(new URL("backolon:parser"), null), env = m.global;
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
    export_("tag", B_Parser_tag);
    return m;
}
