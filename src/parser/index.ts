import { AccessType, Continuation, ErrnoCode, JEBError, Location, makeJSFun, makeOpcode, NOTHING, OP_apply, OP_eval, OP_set_env, OP_shuffle, OP_unwrap, peekData, popData, pushCommand, pushData, VariableReference, withType } from "@r47onfire/jeb";
import { stringify } from "lib0/json";
import { max } from "lib0/math";
import { SourceTracker } from "../runtime/importer";
import { type Module, MODULE_SELF } from "../runtime/module";
import { BackolonVM } from "../runtime/vm";
import { stripInlinedFunctions } from "./debug";
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
 *
 * The parser has two parselet lists:
 * - The normal list (`parselets`): the normal, precedence-sorted parselets.
 * - The T-list (`tParselets`): temporary, unsorted parselets that always
 *   take precedence over everything in the normal list. Constructs like `let`
 *   use the T-list to install terminator parselets (`in`, `end`) that are
 *   only active while the construct is being parsed. `(` clears the T-list
 *   so terminators don't leak into nested expressions.
 */
export class Parser {
    constructor(
        readonly source: SourceTracker,
        readonly index: number,
        readonly parselets: Parselet[],
        readonly constraints: readonly Constraint<Parselet>[],
        readonly tParselets: readonly Parselet[] = [],
    ) { }
    addParselets(...parselets: Parselet[]): Parser {
        return new Parser(this.source, this.index, this.parselets.concat(parselets), this.constraints, this.tParselets);
    }
    addConstraints(...constraints: Constraint<Parselet>[]): Parser {
        return new Parser(this.source, this.index, this.parselets, this.constraints.concat(constraints), this.tParselets);
    }
    /** Add parselets to the front of the T-list (higher precedence than all normal list). */
    addTParselets(...parselets: Parselet[]): Parser {
        return new Parser(this.source, this.index, this.parselets, this.constraints, parselets.concat(this.tParselets));
    }
    /** Clear the T-list. */
    clearTParselets(): Parser {
        return new Parser(this.source, this.index, this.parselets, this.constraints, []);
    }
    /** Restore the T-list to a saved state (used by P_leftParen/OP_finishGroup). */
    withTParselets(bParselets: readonly Parselet[]): Parser {
        return new Parser(this.source, this.index, this.parselets, this.constraints, bParselets);
    }
    isEOF() {
        return this.index >= this.source.code.length;
    }
    /** In sorted order longest tokens first */
    #munchTable!: [Parselet, number, string][];
    #munched = false;
    #sorted = false;
    #precedenceOf!: Map<Parselet, number>;
    #prepare() {
        const parselets = this.parselets;
        var pOf = this.#precedenceOf;
        if (!this.#sorted) {
            pOf = this.#precedenceOf = sortByConstraints(parselets, this.constraints);
            // T-list parselets outrank all normal list parselets.
            if (this.tParselets.length > 0) {
                const maxAPrecedence = pOf.values().reduce(max);
                for (var p of this.tParselets) {
                    // It would be odd if a parselet was in both the normal list and T-list at the same time,
                    // but if it's in the T-list then avoid overwriting is precedence
                    if (!pOf.has(p)) {
                        pOf.set(p, maxAPrecedence + 1);
                    }
                }
            }
            this.#sorted = true;
            console.log("sorted parselets");
            for (var p of parselets) {
                console.log("  ", p.prefix.source.replaceAll(/\\x[0-9a-f]{2}/ig, x => String.fromCharCode(parseInt(x.slice(2), 16))), p.parse.name, pOf.get(p));
            }
        }
        if (!this.#munched) {
            const t = this.#munchTable = [] as [Parselet, number, string][];
            // T-list entries go first since they always have higher precedence
            var bp = this.tParselets, l = bp.length;
            for (var i = 0; i < l; i++) {
                const p = bp[i]!;
                const match = this.test(p.prefix);
                if (match) {
                    t.push([p, pOf.get(p)!, match[0]]);
                }
            }
            console.log("testing at index", this.index, this.source.code.slice(this.index, this.index + 5));
            for (i = parselets.length - 1; i >= 0; i--) {
                const p = parselets[i]!;
                const match = this.test(p.prefix);
                console.log("munch test", p.prefix.source.replaceAll(/\\x[0-9a-f]{2}/ig, x => String.fromCharCode(parseInt(x.slice(2), 16))), p.parse.name);
                if (match) {
                    console.log("matched on", match[0], match[0].length);
                    t.push([p, pOf.get(p)!, match[0]]);
                }
            }
            t.sort((a, b) => b[2].length - a[2].length);
            this.#munched = true;
            // console.log("munched", this.#munchTable.map(t => [t[1], this.precedenceOf.get(t[0])]));
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
    peek(vm: BackolonVM, startIndex: number, minPrecedence: number, orEqual: boolean): [parselet: Parselet, precedence: number, token: Token, nextIndex: number] | undefined {
        this.#prepare();
        const tab = this.#munchTable;
        for (var i = startIndex; i < tab.length; i++) {
            const { 0: p, 1: pr, 2: t } = tab[i]!;
            // TODO: how to avoid making unused tokens??
            if (lte(minPrecedence, pr, orEqual)) {
                console.log("at index", this.index, "yielding parselet", p.parse.name, "with precedence", pr);
                return [p, pr, this.commitToken(vm, t), i + 1];
            }
        }
    }
    precedence() {
        this.#prepare();
        return this.#precedenceOf.get(this.#munchTable[0]![0])!;
    }
    advance(by: number) {
        const p = new Parser(this.source, this.index + by, this.parselets, this.constraints, this.tParselets);
        if (this.#sorted) {
            p.#sorted = true;
            p.#precedenceOf = this.#precedenceOf;
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
    pushCommand(vm, OP_parseone_result);
    pushCommand(vm, OP_parseone, -Infinity, false, false, 0);
}, null);

const OP_store_result = makeOpcode(null, (vm: BackolonVM) => {
    const the_module: Module = vm.currentEnv.get(MODULE_SELF).or(() => {
        throw new JEBError(ErrnoCode.EPANIC, "not in a module??");
    });
    the_module.result = popData(vm);
}, null);

const OP_parseone_result = makeOpcode(null, (vm: BackolonVM) => {
    if (peekData(vm) === NO_MATCH) {
        if (vm.parser!.isEOF()) {
            popData(vm);
            vm.parser = null;
            return;
        }
        throw new JEBError(ErrnoCode.ESYNTAX, "unexpected character " + stringify(vm.parser!.test(/[\s\S]/)![0]));
    }
    console.log("parse result", stripInlinedFunctions(peekData(vm)));
    // Parse one expression, eval it, discard top, and loop
    pushCommand(vm, OP_moduleParseLoopTop);
    pushCommand(vm, OP_store_result);
    pushCommand(vm, OP_unwrap, []);
    pushCommand(vm, OP_eval, undefined);
    pushCommand(vm, OP_set_env, vm.currentEnv);
}, null);

const OP_assertResult = makeOpcode(null, (vm: BackolonVM) => {
    if (peekData(vm) === NO_MATCH) {
        throw new JEBError(ErrnoCode.ESYNTAX, "expected expression at index " + vm.parser!.index);
    }
}, null);

const OP_parseone = makeOpcode("parseOne", (vm: BackolonVM, { 0: precedence, 1: orEqual, 2: assertResult, 3: parseDepth }: [number, boolean, boolean, number]) => {
    assertIsParsing(vm);
    pushData(vm, NO_MATCH); // initial data
    if (assertResult) pushCommand(vm, OP_assertResult);
    pushCommand(vm, OP_parserfindloop, 0, precedence, orEqual, parseDepth ?? 0);
}, null);

const OP_parserfindloop = makeOpcode(null, (vm: BackolonVM, { 0: index, 1: precedence, 2: orEqual, 3: parseDepth }: [number, number, boolean, number]) => {
    const parser = vm.parser!;
    const depth = parseDepth ?? 0;
    const chomp = parser.peek(vm, index, precedence, orEqual);
    if (chomp === undefined) {
        // don't continue main loop
        return;
    }
    const { 0: parselet, 1: precedence2, 2: token, 3: nextIndex } = chomp;
    // create "skip" continuation = continue
    const skip = new Continuation(vm, [[OP_shuffle, 1, []], [OP_parserfindloop, nextIndex, precedence, orEqual, depth]]); // continue main loop if precedence is high enough
    vm.parser = parser.advance(token.text.length);
    // create "discard" continuation - after parser is updated to have been advanced
    const discard = new Continuation(vm, [[OP_shuffle, 1, []], [OP_parserfindloop, 0, precedence, orEqual, depth]]);
    // do next loop (chomp will be undefined if there's no match)
    pushCommand(vm, OP_parserfindloop, 0, precedence, orEqual, depth);
    // try to call parse
    const left = popData(vm);
    pushData(vm, parselet.parse);
    pushCommand(vm, OP_apply, [makeParseletContext(left, precedence2, token, skip, discard, depth)], undefined, false, true);
}, null);

const makeParseletContext = (leftD: any, precedence: number, token: Token, skip: Continuation<BackolonVM>, discard: Continuation<BackolonVM>, parseDepth: number) => {
    const first = leftD === NO_MATCH, left = first ? undefined : leftD;
    return {
        left,
        first,
        token,
        skip,
        discard,
        parseDepth,
        parse: makeJSFun("parse", [["orEqual", false], ["reset", false], ["assertResult", true]], (({ reset, orEqual, assertResult }: { reset: boolean, orEqual: boolean, assertResult: boolean }, vm: BackolonVM) => {
            pushCommand(vm, OP_parseone, reset ? -Infinity : precedence, orEqual, assertResult, parseDepth + 1);
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
        vm.parser = p.advance(match[0].length);
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
. Adds the tag to the list of tags for all the characters in that span.`);

export const B_Parser_sameline = makeJSFun("parser.sameLine", ["span"], ({ span }, vm: BackolonVM) => {
    assertIsParsing(vm);
    const { start, end, file } = vm.getSpan(withType(span, [Array], "span") as Location);
    const src = vm.getSource(file);
    if (!src) return undefined;
    return !/\n/.test(src.slice(start, end));
},
    `.func (parser.sameLine span)
..param {Location} span
. Returns true if the given span starts and ends on the same line.`);

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
    export_("sameLine", B_Parser_sameline);
    return m;
}
