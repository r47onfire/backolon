import {
    alternatives, cut, epsilon, GrammarCombinator, literal, lookaheadNot,
    optional, regex, repeat, rule, sequence,
} from "./combinator";
import { Grammar } from "./parseToCST";

// lexical helpers

const identChar = regex(/[A-Za-z0-9_]/);

/** blanks and `##` comments, but never a newline */
const ws = regex(/[ \t]*(##[^\n]*)?/);
/** required same-line blank: implicit-call args may not cross a newline */
const wsPlus = regex(/[ \t]+(##[^\n]*)?/);
const nl = regex(/\r\n|[\n\r]/);
/** statement separator: runs of `;` and/or newlines with blanks around */
const sep = sequence(ws, repeat(true, sequence(alternatives(literal(";"), nl), ws)));

/** soft keyword: the word, not followed by an identifier character */
const kw = (word: string): GrammarCombinator =>
    sequence(literal(word), lookaheadNot(identChar));

/** words that can never be implicit-call arguments (block terminators).
 *  `fn`, `let`, `foreach` stay soft: `f fn(x) x` passes a lambda. */
const softKw = alternatives(
    kw("in"), kw("end"), kw("do"), kw("then"), kw("else"));

const pipeOp = alternatives(literal("|?>"), literal("|*>"), literal("|+>"), literal("|>"));
const cmpOp = alternatives(
    literal("=="), literal("!="), literal("<="), literal(">="), literal("<"), literal(">"));
const addOp = alternatives(literal("+"), literal("-"));
const mulOp = alternatives(literal("*"), literal("/"), literal("%"));

// argument lists (shared by implicit calls, explicit calls, and parens)

/** one real argument; never a bare soft keyword */
const arg = sequence(lookaheadNot(softKw), rule("assign"));
/** implicit (juxtaposition) argument: like `arg` but stops before `|>` so
 *  `f x |> g y` is `(f x) |> (g y)`, not `f (x |> g y)` */
const argNoPipe = sequence(lookaheadNot(softKw), rule("argAssign"));
/** an argument slot, possibly empty (`,,` / trailing comma) */
const argOrEmpty = alternatives(arg, epsilon());
/** `f(1, 2)`, `f (1, 2)`, and `f(1, 2), 3`; `()` is zero args, `(,)` is one empty arg */
const explicitArgs = sequence(literal("("), ws, alternatives(
    sequence(argOrEmpty, repeat(true, sequence(ws, literal(","), ws, argOrEmpty))),
    sequence(lookaheadNot(literal(")")), arg),
    epsilon(),
), ws, literal(")"));
/** how a callee takes arguments: explicit parens or same-line juxtaposition */
const callArgs = alternatives(
    sequence(ws, explicitArgs, repeat(false, sequence(ws, literal(","), ws, argOrEmpty))),
    sequence(wsPlus, argNoPipe, repeat(false, sequence(ws, literal(","), ws, argOrEmpty))));

/** `do...end`-style body: optional leading separators/blanks, statements, `end` */
const blockBody: GrammarCombinator = sequence(
    optional(true, sep), ws, optional(true, rule("statementsNoEnd")), ws, kw("end"));
/** `in...end` tail shared by letBlock/letLoop */
const letTail: GrammarCombinator = sequence(ws, kw("in"), blockBody);

/** string pieces: escape or run of ordinary characters */
const dchar = regex(/\\.|[^"\\{]+/);
const schar = regex(/\\.|[^'\\]+/);

export const backolonGrammar: Grammar = {
    // top level ------------------------------------------------------------
    /** whole input (used by tests; the future driver will use `toplevel`) */
    program: sequence(optional(true, sep), optional(true, rule("statements")), optional(true, sep), ws),
    /** one top-level form for the incremental driver */
    toplevel: sequence(optional(true, sep), rule("statement"), ws),
    statements: sequence(
        rule("statement"),
        repeat(false, sequence(sep, rule("statement"))),
        optional(true, sep)),
    /** statements inside `...end` blocks: a bare `end` terminates, never a statement */
    statementsNoEnd: sequence(
        rule("stmtNoEnd"),
        repeat(false, sequence(sep, rule("stmtNoEnd"))),
        optional(true, sep)),
    stmtNoEnd: sequence(lookaheadNot(kw("end")), rule("statement")),
    statement: alternatives(rule("letBlock"), rule("letLoop"), rule("foreach"), rule("expr")),

    // expressions, loosest to tightest ------------------------------------
    expr: rule("assign"),
    /** right associative: `a = b = 1` */
    assign: alternatives(
        sequence(rule("primary"), ws, literal("="), lookaheadNot(literal("=")), ws, rule("assign")),
        rule("pipe")),
    /** assignment without a top-level `|>`: for implicit call args */
    argAssign: alternatives(
        sequence(rule("primary"), ws, literal("="), lookaheadNot(literal("=")), ws, rule("assign")),
        rule("ternary")),
    /** `a |> b it |> c it` collects into one node; looser than implicit calls */
    pipe: alternatives(
        sequence(rule("ternary"), repeat(true, sequence(ws, pipeOp, ws, rule("ternary")))),
        rule("ternary")),
    /** right associative: `a ? b : c ? d : e` */
    ternary: alternatives(
        sequence(rule("or"), ws, literal("?"), ws, rule("expr"), ws, literal(":"), ws, rule("ternary")),
        rule("or")),
    or: alternatives(
        sequence(rule("or"), ws, literal("||"), ws, rule("and")),
        rule("and")),
    and: alternatives(
        sequence(rule("and"), ws, literal("&&"), ws, rule("cmp")),
        rule("cmp")),
    cmp: alternatives(
        sequence(rule("cmp"), ws, cmpOp, ws, rule("add")),
        rule("add")),
    add: alternatives(
        sequence(rule("add"), ws, addOp, ws, rule("mul")),
        rule("mul")),
    mul: alternatives(
        sequence(rule("mul"), ws, mulOp, ws, rule("unary")),
        rule("unary")),
    /** `-2 ** 2` is `-(2 ** 2)` (pow binds tighter than unary `-`), but
     *  `a * -b` works (mul takes unary operands) */
    unary: alternatives(
        sequence(literal("#"), lookaheadNot(literal("#")), ws, rule("unary")),
        sequence(alternatives(literal("-"), sequence(literal("!"), lookaheadNot(literal("=")))), ws, rule("unary")),
        sequence(literal("..."), ws, rule("unary")),
        rule("pow")),
    /** right associative: `2 ** 3 ** 2` */
    pow: alternatives(
        sequence(rule("call"), ws, literal("**"), ws, rule("unary")),
        rule("call")),
    /** `f x`, `f(x)`, `f (x)`, `f x, y`, `f(x)(y)`; juxtaposition is right-nested: `f g x` = `f(g(x))` */
    call: alternatives(
        sequence(rule("primary"), repeat(true, callArgs)),
        rule("primary")),
    primary: alternatives(
        rule("number"), rule("dstring"), rule("sstring"),
        rule("quote"), rule("lambda"), rule("brackets"),
        rule("parens"), rule("name")),

    // atoms ------------------------------------------------------------------
    number: alternatives(
        regex(/0[xX][0-9a-fA-F]+/, "hex"),
        regex(/\d+/, "int"),
        regex(/(\d+\.\d+|\.\d+)(e[+-]\d+)?/i, "float")),
    /** `"..."` with `{expr}` interpolation */
    dstring: sequence(literal("\""),
        repeat(false, alternatives(rule("interp"), dchar)),
        literal("\"")),
    interp: sequence(literal("{"), ws, rule("expr"), ws, cut(), literal("}")),
    /** `'...'` plain */
    sstring: sequence(literal("'"), repeat(false, schar), literal("'")),
    /** `` `(x + y) ``, `` `name ``, ``` ``(x) ``` */
    quote: sequence(repeat(true, literal("`")), ws, rule("call")),
    lambda: alternatives(
        sequence(kw("fn"), ws, rule("fnParams"), alternatives(
            sequence(optional(true, sep), ws, optional(true, rule("statementsNoEnd")), ws, kw("end")),
            sequence(wsPlus, rule("expr")))),
        sequence(literal("["), ws, optional(true, rule("paramList")), ws, literal("]"),
            ws, literal("=>"), ws, rule("expr"))),
    fnParams: sequence(literal("("), ws, optional(true, rule("paramList")), ws, literal(")")),
    paramList: sequence(
        rule("param"), repeat(false, sequence(ws, literal(","), ws, rule("param")))),
    param: sequence(rule("name"), optional(true, literal("..."))),
    /** `(...)`: comma list, `;`-separated statements, or empty */
    parens: sequence(literal("("), ws, alternatives(
        sequence(argOrEmpty, repeat(true, sequence(ws, literal(","), ws, argOrEmpty))),
        rule("statements"),
        epsilon(),
    ), ws, literal(")")),
    /** `[...]`: list, or object when any `k: v` pair is present; `[:]` is the empty object */
    brackets: sequence(literal("["), ws, alternatives(
        rule("bracketItems"),
        epsilon(),
    ), ws, literal("]")),
    bracketItems: sequence(
        rule("bracketItem"), repeat(false, sequence(ws, literal(","), ws, rule("bracketItem")))),
    bracketItem: alternatives(rule("pair"), rule("expr")),
    pair: sequence(
        optional(true, rule("expr")), ws, literal(":"), ws, optional(true, rule("expr"))),
    name: regex(/[A-Z_][A-Z0-9_]*/i),

    // block constructs -------------------------------------------------------
    letBlock: sequence(kw("let"), wsPlus, rule("letArgs"), letTail),
    letLoop: sequence(kw("let"), ws, literal("("), ws, rule("name"), ws, literal(")"),
        wsPlus, rule("letArgs"), letTail),
    letArgs: sequence(arg, repeat(false, sequence(ws, literal(","), ws, argOrEmpty))),
    foreach: sequence(kw("foreach"), wsPlus, rule("name"), wsPlus, kw("in"), wsPlus,
        rule("expr"), wsPlus, kw("do"), blockBody),
};
