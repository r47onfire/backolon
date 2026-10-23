import { alt, altFirst, ambient, bind, cut, eps, Grammar, GrammarCombinator, if_, ignored, joined, kw, lit, lookahead, no, nonempty, opt, param, regex, rep, rule, sameline, seq, ssep, tag, try_, yes } from "./combinator";

// TODO: make these helpers more combinators, since js functions act like macros
// which are unavailable to patched code

/**
 * The soft-keyword guard, as a dynamic parameter. At the places an
 * expression or an implicit argument may start, `ignored(guardHere())`
 * succeeds only if the next word is not structural *in the current nesting
 * context*: constructs extend the guard with the keywords that delimit
 * their own parts (so their parts cannot swallow those keywords), and
 * bracketed contexts reset it (nothing inside brackets can end an
 * enclosing block, so every soft keyword is usable as a plain name there).
 * With no binding in effect, the reference-site default blocks nothing:
 * any word may start an expression or an argument at top level. A block
 * construct still claims its delimiting keywords -- not through the
 * guard, but because `expr` tries block expressions before simple ones
 * and takes the first match (see `altFirst`): the name/implicit-call
 * reading of the same text never gets to swallow a block's parts, even
 * where it would match longer.
 */
const guardName = "guard";
const guardHere = (): GrammarCombinator => ambient(guardName, eps());
const guardExtendedBy = (extra: GrammarCombinator, body: GrammarCombinator): GrammarCombinator =>
    bind(guardName, seq(guardHere(), lookahead(false, extra)), body);
const guardReset = (body: GrammarCombinator): GrammarCombinator => bind(guardName, eps(), body);

/**
 * The Backolon grammar, as plain combinator data.
 *
 * The expression rules form a precedence chain from loosest to tightest:
 *
 * * expr
 * * pipe
 * * implicit_call
 * * kw_arg
 * * assignment
 * * ternary
 * * logical
 * * comparison
 * * bitwise
 * * bitshift
 * * sum
 * * term
 * * factor
 * * indexing
 * * primary
 *
 * Binary levels are written left-recursively (the parser grows the
 * recursion), and after matching an operator each level first checks a
 * negative lookahead on `assign_op` -- so `a += b` is not misread as a binary
 * `+` followed by a prefix `=` assignment -- and then cuts to commit the level.
 */
export const backolonGrammar: Grammar = {
    blank: ignored(rep(false, alt(regex(/\s*/), rule("comment")))),
    blank_required: ignored(nonempty(rule("blank"))),
    blank_sameline: ignored(sameline(rule("blank_required"))),

    comment: ignored(tag("comment", alt(rule("block_comment"), rule("line_comment")))),
    block_comment: seq(lit("##[["), rep(false, alt(rule("block_comment"), seq(lookahead(false, lit("##]]")), regex(/./s)))), lit("##]]")),
    line_comment: regex(/##(?!\[\[)[^\n]*(\n|$)/),

    expr_sep: ignored(rep(true, alt(rule("semi"), rule("nl"), rule("comment")))),
    semi: ignored(tag("punctuation", lit(";"))),
    nl: lit("\n"),
    comma: ignored(tag("punctuation", lit(","))),

    exprs: seq(
        rep(false,
            seq(
                ignored(opt(rule("expr_sep"))),
                ignored(opt(rule("blank"))),
                ignored(guardHere()),
                rule("expr"),
            ),
        ),
        ignored(opt(rule("expr_sep"))),
    ),
    toplevel_exprs: nonempty(rule("exprs")),
    toplevel_expr: rep(true, seq(ignored(opt(rule("expr_sep"))), ignored(opt(rule("blank"))), rule("expr"))),
    expr: altFirst(rule("block_expr"), rule("simple_expr")),

    // block_expr: let, if, while, foreach, trycatch, with, fn
    block_expr: alt(
        rule("strong_block"),
        rule("let"),
        rule("if"),
        rule("while"),
        rule("for"),
        rule("trycatch"),
        rule("with"),
        rule("fn"),
        rule("always"),
    ),
    strong_block: alt(
        rule("do"),
    ),

    let: ssep(rule("blank"), kw("keyword", "let"), alt(
        rule("let_loop_block"),
        rule("let_block"),
        rule("simple_let"),
    )),
    simple_let: guardExtendedBy(kw("keyword", "in"), rule("implicit_args")),
    let_block: ssep(
        rule("blank"),
        rule("simple_let"),
        seq(
            kw("keyword", "in"),
            // no sep here!
            rule("body_exprs", kw("keyword", "end"), yes()),
        ),
    ),
    let_loop_block: ssep(
        rule("blank"),
        ignored(tag("punctuation", lit("("))),
        cut(),
        rule("name"),
        ignored(tag("punctuation", lit(")"))),
        rule("let_block"),
    ),

    if: ssep(rule("blank"), kw("keyword", "if"), seq(
        guardExtendedBy(kw("keyword", "then"), rule("expr")),
        ignored(opt(rule("blank"))),
        ignored(opt(kw("keyword", "then"))),
        altFirst(
            rule("if_else"),
            rule("if_no_else"),
        ),
    )),
    if_else: seq(
        rule("body_exprs", kw("keyword", "else", "end"), no()),
        ignored(rule("blank")),
        kw("keyword", "else"),
        rule("body_exprs", kw("keyword", "end"), no()),
        ignored(opt(seq(rule("blank"), kw("keyword", "end")))),
    ),
    if_no_else: seq(
        rule("body_exprs", kw("keyword", "else", "end"), no()),
        ignored(opt(seq(rule("blank"), kw("keyword", "end")))),
    ),


    while: ssep(rule("blank"), kw("keyword", "while"), seq(
        ignored(rule("blank")),
        rule("expr"),
        rule("body_exprs", kw("keyword", "end"), yes()),
    )),

    for: ssep(rule("blank"), kw("keyword", "for"), seq(
        ignored(rule("blank")),
        rule("expr"),
        rule("body_exprs", kw("keyword", "end"), yes()),
    )),

    trycatch: ssep(rule("blank"), kw("keyword", "try"), seq(
        rule("trycatch_guarded"),
        cut(),
        rep(false, rule("trycatch_handler")),
        opt(rule("trycatch_else")),
        opt(rule("trycatch_finally")),
        ignored(seq(rule("blank"), kw("keyword", "end"))),
    )),
    trycatch_guarded: rule("body_exprs", kw("keyword", "catch", "finally", "else", "end"), no()),
    trycatch_handler: seq(
        ignored(rule("blank")),
        kw("keyword", "catch"),
        ignored(rule("blank")),
        guardExtendedBy(kw("keyword", "catch", "finally", "else", "end"), rule("expr")),
        rule("body_exprs", kw("keyword", "catch", "finally", "else", "end"), no()),
    ),
    trycatch_else: seq(
        ignored(rule("blank")),
        kw("keyword", "else"),
        rule("body_exprs", kw("keyword", "finally", "end"), no()),
    ),
    trycatch_finally: seq(
        ignored(rule("blank")),
        kw("keyword", "finally"),
        rule("body_exprs", kw("keyword", "end"), no()),
    ),



    with: ssep(rule("blank"), kw("keyword", "with"), seq(
        rule("expr"),
        rule("body_exprs", kw("keyword", "end"), yes()),
    )),

    fn: ssep(rule("blank"), kw("keyword", "fn"), rule("fn_body")),


    always: ssep(rule("blank"), kw("keyword", "always"), seq(
        cut(),
        ignored(tag("keyword", lit("@"))),
        cut(),
        rule("par_exp"),
        rule("body_exprs", kw("keyword", "end"), yes()),
    )),

    do: ssep(rule("blank"), kw("keyword", "do", "begin"), rule("body_exprs", kw("keyword", "end"), yes())),

    body_exprs: [["end", "consume"], guardExtendedBy(param("end"), altFirst(
        seq(
            ignored(rule("blank_sameline")),
            ignored(guardHere()),
            rule("expr"),
            ignored(if_(param("consume"), opt(param("end")), eps())),
        ),
        seq(
            rule("exprs"),
            ignored(if_(param("consume"), opt(param("end")), eps())),
        ),
    ))],

    simple_expr: rule("pipe"),

    // left associative
    pipe: alt(ssep(rule("blank"), rule("pipe"), rule("pipe_op"), cut(), rule("implicit_call")), rule("implicit_call")),
    pipe_op: alt(
        rule("normal_pipe"),
        rule("filter_pipe"),
        rule("map_pipe"),
        rule("reduce_pipe"),
    ),
    normal_pipe: tag("operator", lit("|>")),
    filter_pipe: tag("operator", lit("|?>")),
    map_pipe: tag("operator", lit("|*>")),
    reduce_pipe: seq(tag("operator", lit("|+>")), cut(), tag("operator", lit("[")), guardReset(rule("exprs")), tag("operator", lit("]"))),

    // right associative
    // implicit call is speculative since it's implicit, so if the arguments can't be parsed for any reason, give up and try kw_arg
    implicit_call: alt(ssep(rule("blank_sameline"), rule("kw_arg"), try_(nonempty(rule("implicit_args")))), rule("kw_arg")),
    implicit_args: seq(
        // can't use joined() here since the first and second are different + there are lookahead assertions!
        ignored(guardHere()),
        lookahead(false, rule("strong_block")),
        rule("implicit_call"),
        rep(false, seq(
            ignored(seq(opt(rule("blank_sameline")), rule("comma"), opt(rule("blank_sameline")))),
            lookahead(false, rule("strong_block")),
            ignored(guardHere()),
            alt(rule("implicit_call"), rule("empty_arg"))
        )),
    ),

    empty_arg: seq(eps(), lookahead(true, rule("comma"))), // only between commas

    // non-associative
    kw_arg: alt(ssep(rule("blank"), rule("assignment"), rule("kw_arg_op"), cut(), rule("assignment")), rule("assignment")),
    kw_arg_op: alt(
        rule("kw"),
    ),
    kw: tag("operator", lit(":")),

    // right associative
    assignment: alt(ssep(rule("blank"), rule("ternary"), rule("assign_op"), cut(), rule("assignment")), rule("ternary")),
    assign_op: alt(
        rule("old_assign"),
        rule("aug_assign"),
        rule("normal_assign"),
    ),
    old_assign: tag("operator", lit("<-")),
    aug_assign: seq(rule("aug_assign_prefix"), rule("normal_assign")),
    normal_assign: tag("operator", regex(/=(?!=)/)),
    aug_assign_prefix: alt(
        rule("logical_op"),
        rule("bitwise_op"),
        rule("bitshift_op"),
        rule("sum_op"),
        rule("term_op"),
        rule("factor_op"),
    ),

    // right associative
    ternary: alt(ssep(rule("blank"), rule("logical"), tag("operator", lit("?")), cut(), rule("assignment"), cut(), tag("operator", lit(":")), rule("ternary")), rule("logical")),

    // left associative
    logical: alt(ssep(rule("blank"), rule("logical"), rule("logical_op"), lookahead(false, rule("assign_op")), cut(), rule("comparison")), rule("comparison")),
    logical_op: alt(
        rule("logical_and"),
        rule("logical_or"),
    ),
    logical_and: alt(tag("operator", lit("&&")), kw("operator", "and")),
    logical_or: alt(tag("operator", lit("||")), kw("operator", "or")),

    // chain associative
    comparison: alt(
        joined(
            seq(
                ignored(opt(rule("blank"))),
                rule("comparison_op"),
                ignored(opt(rule("blank"))),
            ),
            rule("bitwise"),
            true,
            false,
        ),
        rule("bitwise"),
    ),
    comparison_op: alt(
        rule("equal"),
        rule("not_equal"),
        rule("lte"),
        rule("gte"),
        rule("less"),
        rule("greater"),
    ),
    equal: tag("operator", lit("==")),
    not_equal: tag("operator", lit("!=")),
    lte: tag("operator", lit("<=")),
    gte: tag("operator", lit(">=")),
    less: tag("operator", regex(/<(?![<-])/)),
    greater: tag("operator", regex(/>(?!>)/)),

    // left associative
    bitwise: alt(ssep(rule("blank"), rule("bitwise"), rule("bitwise_op"), lookahead(false, rule("assign_op")), cut(), rule("bitshift")), rule("bitshift")),
    bitwise_op: alt(
        rule("bitwise_and"),
        rule("bitwise_or"),
        rule("bitwise_xor"),
    ),
    bitwise_and: tag("operator", lit("&")),
    bitwise_or: tag("operator", regex(/\|(?![?*+>])/)),
    bitwise_xor: tag("operator", lit("^")),

    // left associative
    bitshift: alt(ssep(rule("blank"), rule("bitshift"), rule("bitshift_op"), lookahead(false, rule("assign_op")), cut(), rule("sum")), rule("sum")),
    bitshift_op: alt(
        rule("shift_left"),
        rule("shift_right"),
    ),
    shift_left: tag("operator", lit("<<")),
    shift_right: tag("operator", lit(">>")),

    // left associative
    sum: alt(ssep(rule("blank"), rule("sum"), rule("sum_op"), lookahead(false, rule("assign_op")), cut(), rule("term")), rule("term")),
    sum_op: alt(
        rule("add"),
        rule("sub"),
    ),
    add: tag("operator", lit("+")),
    sub: tag("operator", regex(/-(?![>])/)),

    // left associative
    term: alt(ssep(rule("blank"), rule("term"), rule("term_op"), lookahead(false, rule("assign_op")), cut(), rule("factor")), rule("factor")),
    term_op: alt(
        rule("mul"),
        rule("div"),
        rule("mod"),
    ),
    mul: tag("operator", regex(/\*(?!\*)/)),
    div: tag("operator", lit("/")),
    mod: tag("operator", lit("%")),

    // right associative
    factor: alt(ssep(rule("blank"), rule("indexing"), rule("factor_op"), lookahead(false, rule("assign_op")), cut(), rule("factor")), rule("indexing")),
    factor_op: alt(
        rule("pow"),
    ),
    pow: tag("operator", lit("**")),

    // left associative
    indexing: alt(ssep(rule("blank"), rule("indexing"), rule("indexing_op"), cut(), rule("primary")), rule("primary")),
    indexing_op: alt(
        rule("dot"),
        rule("up_dot"),
        rule("arrow"),
    ),
    dot: tag("operator", lit(".")),
    up_dot: tag("operator", lit("..")),
    arrow: tag("operator", lit("->")),

    // primary: unary operators or atom
    primary: alt(
        rule("unary"),
        rule("atom"),
    ),
    // these are all prefix unary
    unary: alt(
        rule("explicit_call"),
        rule("prefix"),
    ),

    explicit_call: ssep(rule("blank"), rule("primary"), ignored(tag("operator", lit("("))), cut(), rule("explicit_args"), ignored(tag("operator", lit(")")))),
    explicit_args: alt(
        guardReset(joined(
            ignored(seq(opt(rule("blank")), rule("comma"), opt(rule("blank")))),
            alt(rule("expr"), rule("empty_arg")),
            false, false,
        )),
        seq(), // empty args
    ), // allow blank arguments

    prefix: ssep(rule("blank"), rule("prefix_op"), cut(), rule("factor")),
    prefix_op: alt(
        rule("length"),
        rule("spread"),
        rule("negate"),
        rule("abs"),
        rule("not"),
        rule("bit_not"),
        rule("quote"),
        rule("unquote"),
        rule("unquote_splicing"),
        rule("special"),
        rule("lazy"),
        rule("ref"),
        rule("deref"),
    ),

    length: tag("operator", lit("#")),
    spread: tag("operator", lit("...")),
    negate: tag("operator", lit("-")),
    abs: tag("operator", lit("+")),
    not: tag("operator", regex(/!(?!=)/)),
    bit_not: tag("operator", lit("~")),
    quote: tag("operator", lit("`")),
    unquote: tag("operator", lit("$")),
    unquote_splicing: tag("operator", lit("$.")),
    special: tag("operator", lit("@")),
    lazy: tag("operator", lit("^")),
    ref: tag("operator", regex(/&/)),
    deref: tag("operator", lit("*")),

    // atoms: number, string, regex, boolean, null, collection literal, quasiquote, parenthesized expression, name
    atom: alt(
        rule("number"),
        rule("string"),
        rule("regex"),
        rule("boolean"),
        rule("collection"),
        rule("quasiquote"),
        rule("par_exp"),
        rule("name"),
    ),

    number: tag("number", alt(
        rule("hex"),
        rule("bin"),
        rule("decimal"),
    )),
    hex: regex(/0x[a-f0-9]+/i),
    bin: regex(/0b[01]+/i),
    decimal: regex(/((?!0\d)\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?/i),

    string: alt(rule("r_string"), rule("i_string")),

    r_string: seq(ignored(tag("string", lit("'"))), cut(), rep(false, rule("r_part")), ignored(tag("string", lit("'")))),
    r_part: alt(
        rule("r_escape"),
        rule("r_body"),
    ),
    r_escape: tag("escape", regex(/\\./)),
    r_body: tag("string", regex(/[^'\\]+/)),

    i_string: seq(ignored(tag("string", lit("\""))), cut(), rep(false, rule("i_part")), ignored(tag("string", lit("\"")))),
    i_part: alt(
        rule("i_escape"),
        rule("i_interpolation"),
        rule("i_body"),
    ),
    i_escape: tag("escape", seq(regex(/\\(?!\()/), cut(), rule("i_escape_body"))),
    i_escape_body: alt(
        rule("i_known_escape"),
        rule("i_x_escape"),
        rule("i_u_escape"),
        rule("i_U_escape"),
    ),
    i_known_escape: regex(/[abefnrtvz"']/), // cSpell: ignore abefnrtvz
    i_x_escape: seq(lit("x"), cut(), regex(/[0-9a-f]{2}/)),
    i_u_escape: seq(lit("u"), cut(), regex(/[0-9a-f]{4}/)),
    i_U_escape: seq(lit("U"), cut(), regex(/\{[0-9a-f]+\}/)),
    i_interpolation: seq(ignored(tag("escape", lit("\\("))), cut(), guardReset(rule("exprs")), ignored(tag("escape", lit(")")))),
    i_body: tag("string", regex(/[^"\\]+/)),

    regex: tag("regex", seq(ignored(lit("/")), rule("regex_body"), ignored(lit("/")), rule("regex_flags"))),
    regex_body: regex(/(\[([^\]]|\\\])+\]|\\.|[^\\/\n])*/),
    regex_flags: regex(/[gimsuvy]*/), // cSpell: ignore gimsuvy

    boolean: alt(rule("boolean_true"), rule("boolean_false")),
    boolean_true: kw("boolean", "true", "True", "TRUE"),
    boolean_false: kw("boolean", "false", "False", "FALSE"),

    collection: ssep(rule("blank"), ignored(tag("operator", lit("["))), cut(), rule("collection_body"), ignored(tag("operator", lit("]")))),
    collection_body: guardReset(alt(
        rule("empty_collection"),
        joined(ignored(seq(opt(rule("blank")), rule("comma"), opt(rule("blank")))), rule("collection_item"), false, true), // TODO: allow trailing comma
    )),
    empty_collection: alt(
        rule("empty_list"),
        rule("empty_map"),
    ),
    empty_list: eps(),
    empty_map: tag("operator", lit(":")),
    collection_item: alt(
        rule("collection_shorthand"),
        rule("expr"),
    ),
    collection_shorthand: ssep(rule("blank"), rule("quote"), alt(rule("atom"), rule("par_exp")), ignored(tag("operator", lit(":")))),

    quasiquote: tag("quoted", ssep(rule("blank"), ignored(tag("operator", lit("{"))), cut(), guardReset(rule("exprs")), ignored(tag("operator", lit("}"))))),
    par_exp: ssep(rule("blank"), ignored(tag("operator", lit("("))), cut(), guardReset(rule("exprs")), ignored(tag("operator", lit(")")))),
    name: tag("name", regex(/[_\p{L}][_\p{L}\p{N}]*/u)),
};

/** Every highlight tag name used anywhere in {@link backolonGrammar}, collected by walking all of its combinator trees (e.g. for building a syntax-highlight theme). */
export const all_tags = new Set(function walk(g: any): string[] {
    if (typeof g !== "object") return [];
    return (g.op === "tag" || g.op === "kw" ? [g.tag] : []).concat(Object.values(g).flatMap(walk));
}(backolonGrammar));
// console.log({ all_tags });
// Object.entries(backolonGrammar).forEach(([rule, g]) => {
//     console.log(`${rule}: ${describeCombinator(Array.isArray(g) ? g[1] : g)}`);
// });
