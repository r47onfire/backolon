import { alt, altFirst, ambient, bind, cut, Grammar, GrammarCombinator, if_, ignored, joined, kw, lit, lookahead, MixAction, no, nonempty, nothing, op, opDefs, opt, param, regex, rep, rule, sameline, seq, ssep, tag, try_, yes } from "./combinator";
import { walkCombinator } from "./walk";

/**
 * The Backolon grammar, as plain combinator data.
 *
 * The expression rules form a precedence chain from loosest to tightest:
 *
 * * expr
 * * pipe
 * * implicit_call
 * * kw_arg
 * * assign_rev
 * * assignment
 * * ternary
 * * logical
 * * comparison
 * * containment
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
    block_comment: seq(lit("##[["), rep(false, alt(rule("block_comment"), seq(lookahead(false, lit("##]]")), regex(/((?!##).)+|./s)))), lit("##]]")),
    line_comment: regex(/##(?!\[\[)[^\n]*(\n|$)/),

    expr_sep: ignored(rep(true, alt(rule("semi"), rule("nl"), rule("comment")))),
    semi: op("punctuation", ";"),
    nl: lit("\n"),
    comma: op("punctuation", ","),

    exprs: seq(
        rep(false,
            seq(
                ignored(opt(rule("expr_sep"))),
                ignored(opt(rule("blank"))),
                ignored(ambient("guard", nothing())),
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
    // add a blank node before to prevent the single rule wrapped from being elided
    simple_let: seq(ignored(nothing()), rule("let_header")),
    let_header: bind("guard", true, lookahead(false, kw("keyword", "in")), rule("implicit_args")),
    let_block: ssep(
        rule("blank"),
        rule("let_header"),
        seq(
            kw("keyword", "in"),
            // no sep here!
            rule("body_exprs", kw("keyword", "end"), yes()),
        ),
    ),
    let_loop_block: ssep(
        rule("blank"),
        op("punctuation", "("),
        cut(),
        rule("name"),
        op("punctuation", ")"),
        rule("let_block"),
    ),

    if: ssep(rule("blank"), kw("keyword", "if"), seq(
        bind("guard", true, lookahead(false, kw("keyword", "then")), rule("expr")),
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
        rule("body_exprs", kw("keyword", "end"), yes()),
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
        rule("assignment"),
        rule("body_exprs", kw("keyword", "end"), yes()),
    )),

    trycatch: ssep(rule("blank"), kw("keyword", "try"), seq(
        rule("trycatch_guarded"),
        cut(),
        rep(false, rule("trycatch_handler")),
        opt(rule("trycatch_else")),
        opt(rule("trycatch_finally")),
        ignored(opt(seq(rule("blank"), kw("keyword", "end")))),
    )),
    trycatch_guarded: rule("body_exprs", kw("keyword", "catch", "finally", "else", "end"), no()),
    trycatch_handler: seq(
        ignored(rule("blank")),
        kw("keyword", "catch"),
        ignored(rule("blank")),
        bind("guard", true, lookahead(false, kw("keyword", "catch", "finally", "else", "end")), rule("expr")),
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

    fn: ssep(rule("blank"), kw("keyword", "fn"), op("punctuation", "("), cut(), rule("explicit_args"), seq(op("punctuation", ")"), rule("body_exprs", kw("keyword", "end"), yes()))),

    always: ssep(rule("blank"), kw("keyword", "always"), seq(
        cut(),
        ignored(tag("keyword", lit("@"))),
        cut(),
        rule("par_exp"),
        rule("body_exprs", kw("keyword", "end"), yes()),
    )),

    do: ssep(rule("blank"), kw("keyword", "do", "begin"), rule("body_exprs", kw("keyword", "end"), yes())),

    body_exprs: [["end", "consume"], bind("guard", true, lookahead(false, param("end")), seq(
        altFirst(
            seq(
                ignored(rule("blank_sameline")),
                ignored(ambient("guard", nothing())),
                rule("expr"),
            ),
            seq(
                rule("exprs"),
            ),
        ),
        ignored(if_(param("consume"), opt(seq(rule("blank"), param("end"))), nothing())),
    ))],

    simple_expr: rule("pipe"),

    binary_op: [["nomatch", "op", "lhs", "rhs", "guard"], alt(
        ssep(rule("blank"), param("lhs"), param("op"), ignored(param("guard")), cut(), param("rhs")),
        param("nomatch"),
    )],

    // left associative
    pipe: rule("binary_op", rule("implicit_call"), rule("pipe_op"), rule("pipe"), rule("implicit_call"), nothing()),
    pipe_op: alt(
        rule("normal_pipe"),
        rule("filter_pipe"),
        rule("map_pipe"),
        rule("reduce_pipe"),
    ),
    normal_pipe: op("operator", "|>"),
    filter_pipe: op("operator", "|?>"),
    map_pipe: op("operator", "|*>"),
    reduce_pipe: seq(op("operator", "|+>"), cut(), op("punctuation", "["), bind("guard", false, nothing(), rule("exprs")), op("punctuation", "]")),

    // right associative
    // implicit call is speculative since it's implicit, so if the arguments can't be parsed for any reason, give up and try kw_arg
    implicit_call: alt(ssep(rule("blank_sameline"), rule("kw_arg"), try_(nonempty(rule("implicit_args")))), rule("kw_arg")),
    implicit_args: seq(
        // can't use joined() here since the first and second are different + there are lookahead assertions!
        ignored(ambient("guard", nothing())),
        lookahead(false, rule("strong_block")),
        altFirst(rule("block_expr"), rule("implicit_call")),
        rep(false, seq(
            ignored(seq(opt(rule("blank_sameline")), rule("comma"), opt(rule("blank_sameline")))),
            lookahead(false, rule("strong_block")),
            ignored(ambient("guard", nothing())),
            altFirst(rule("block_expr"), rule("implicit_call"), rule("empty_arg"))
        )),
    ),

    empty_arg: seq(nothing(), lookahead(true, rule("comma"))), // only between commas

    // non associative
    kw_arg: rule("binary_op", rule("assign_rev"), rule("kw_arg_op"), rule("assign_rev"), rule("assign_rev"), nothing()),
    kw_arg_op: alt(
        rule("kw"),
    ),
    kw: op("operator", ":"),

    // left associative
    assign_rev: rule("binary_op", rule("assignment"), rule("assign_rev_op"), rule("assign_rev"), rule("assignment"), nothing()),
    assign_rev_op: alt(
        rule("arrow"),
    ),
    arrow: op("operator", "->"),

    // strongly right associative
    assignment: rule("binary_op", rule("ternary"), rule("assign_op"), rule("ternary"), rule("expr"), nothing()),
    assign_op: alt(
        rule("old_assign"),
        rule("aug_assign"),
        rule("normal_assign"),
    ),
    old_assign: op("operator", "<-"),
    aug_assign: seq(rule("aug_assign_prefix"), ignored(rule("normal_assign"))),
    normal_assign: op("operator", "="),
    aug_assign_prefix: alt(
        rule("logical_op"),
        rule("bitwise_op"),
        rule("bitshift_op"),
        rule("sum_op"),
        rule("term_op"),
        rule("factor_op"),
    ),

    // right associative
    ternary: alt(ssep(rule("blank"), rule("logical"), op("operator", "?"), cut(), rule("assignment"), cut(), op("operator", ":"), rule("ternary")), rule("logical")),

    // left associative
    logical: rule("binary_op", rule("comparison"), rule("logical_op"), rule("logical"), rule("comparison"), lookahead(false, rule("assign_op"))),
    logical_op: alt(
        rule("logical_and"),
        rule("logical_or"),
    ),
    logical_and: alt(op("operator", "&&"), kw("operator", "and")),
    logical_or: alt(op("operator", "||"), kw("operator", "or")),

    // chain associative
    comparison: alt(
        joined(
            seq(
                ignored(opt(rule("blank"))),
                rule("comparison_op"),
                ignored(opt(rule("blank"))),
            ),
            rule("containment"),
            true,
            false,
        ),
        rule("containment"),
    ),
    comparison_op: alt(
        rule("equal"),
        rule("not_equal"),
        rule("lte"),
        rule("gte"),
        rule("less"),
        rule("greater"),
    ),
    equal: op("operator", "=="),
    not_equal: op("operator", "!="),
    lte: op("operator", "<="),
    gte: op("operator", ">="),
    less: op("operator", "<"),
    greater: op("operator", ">"),

    // non associative
    containment: rule("binary_op", rule("bitwise"), rule("containment_op"), rule("bitwise"), rule("bitwise"), nothing()),
    containment_op: alt(
        rule("needle_in_haystack"),
        rule("haystack_has_needle"),
    ),
    needle_in_haystack: alt(op("operator", "<:"), seq(ignored(ambient("guard", nothing())), kw("operator", "in"))),
    haystack_has_needle: alt(op("operator", ":>"), kw("operator", "has")),

    // left associative
    bitwise: rule("binary_op", rule("bitshift"), rule("bitwise_op"), rule("bitwise"), rule("bitshift"), lookahead(false, rule("assign_op"))),
    bitwise_op: alt(
        rule("bitwise_and"),
        rule("bitwise_or"),
        rule("bitwise_xor"),
    ),
    bitwise_and: op("operator", "&"),
    bitwise_or: op("operator", "|"),
    bitwise_xor: op("operator", "^"),

    // left associative
    bitshift: rule("binary_op", rule("sum"), rule("bitshift_op"), rule("bitshift"), rule("sum"), lookahead(false, rule("assign_op"))),
    bitshift_op: alt(
        rule("shift_left"),
        rule("shift_right"),
    ),
    shift_left: op("operator", "<<"),
    shift_right: op("operator", ">>"),

    // left associative
    sum: rule("binary_op", rule("term"), rule("sum_op"), rule("sum"), rule("term"), lookahead(false, rule("assign_op"))),
    sum_op: alt(
        rule("add"),
        rule("sub"),
    ),
    add: op("operator", "+"),
    sub: op("operator", "-"),

    // left associative
    term: rule("binary_op", rule("factor"), rule("term_op"), rule("term"), rule("factor"), lookahead(false, rule("assign_op"))),
    term_op: alt(
        rule("mul"),
        rule("div"),
        rule("mod"),
    ),
    mul: op("operator", "*"),
    div: op("operator", "/"),
    mod: op("operator", "%"),

    // right associative
    factor: rule("binary_op", rule("postfix"), rule("factor_op"), rule("postfix"), rule("factor"), lookahead(false, rule("assign_op"))),
    factor_op: alt(
        rule("pow"),
    ),
    pow: op("operator", "**"),

    // postfix: a call binds to a whole indexing chain, so calls and
    // indexing are one left-associative level entered through here
    postfix: altFirst(rule("explicit_call"), rule("indexing")),

    explicit_call: ssep(rule("blank"), rule("postfix"), op("punctuation", "("), cut(), rule("explicit_args"), op("punctuation", ")")), explicit_args: alt(
        bind("guard", false, nothing(), joined(
            ignored(rule("ws_comma")),
            alt(rule("expr"), rule("empty_arg")),
            false, true,
        )),
        seq(), // empty args
    ), // allow blank arguments

    // left associative
    indexing: rule("binary_op", rule("primary"), rule("indexing_op"), rule("postfix"), rule("primary"), nothing()),
    indexing_op: alt(
        rule("dot"),
        rule("up_dot"),
    ),
    dot: op("operator", "."),
    up_dot: op("operator", ".."),

    // primary: unary operators or atom
    primary: alt(
        rule("unary"),
        rule("atom"),
    ),
    // these are all prefix unary
    unary: alt(
        rule("prefix"),
    ),

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

    length: op("operator", "#"),
    spread: op("operator", "..."),
    negate: op("operator", "-"),
    abs: op("operator", "+"),
    not: op("operator", "!"),
    bit_not: op("operator", "~"),
    quote: op("operator", "`"),
    unquote: op("operator", "$"),
    unquote_splicing: op("operator", "$."),
    special: op("operator", "@"),
    lazy: op("operator", "^"),
    ref: op("operator", "&"),
    deref: op("operator", "*"),

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
        rule("dec"),
    )),
    hex: seq(ignored(lit("0x")), cut(), regex(/[a-f0-9]+/i)),
    bin: seq(ignored(lit("0b")), cut(), regex(/[01]+/i)),
    dec: regex(/((?!0\d)\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?/i),

    string: alt(rule("r_string"), rule("i_string")),

    r_string: seq(ignored(tag("string", lit("'"))), cut(), rep(false, rule("r_part")), ignored(tag("string", lit("'")))),
    r_part: alt(
        rule("r_escape"),
        rule("r_body"),
    ),
    r_escape: tag("escape", regex(/\\./)),
    r_body: tag("string", regex(/[^'\\]+/)),

    i_string: seq(ignored(tag("string", lit("\""))), cut(), rep(false, alt(
        tag("escape", seq(ignored(regex(/\\(?!\()/)), cut(), rule("i_escape"))),
        rule("i_interpolation"),
        rule("i_body"),
    )), ignored(tag("string", lit("\"")))),
    i_escape: alt(
        rule("i_known_escape"),
        rule("i_x_escape"),
        rule("i_u_escape"),
        rule("i_U_escape"),
    ),
    i_known_escape: regex(/./),
    i_x_escape: seq(ignored(lit("x")), cut(), regex(/[0-9a-f]{2}/)),
    i_u_escape: seq(ignored(lit("u")), cut(), regex(/[0-9a-f]{4}/)),
    i_U_escape: seq(ignored(lit("U")), cut(), ignored(lit("{")), regex(/[0-9a-f]+/), ignored(lit("}"))),
    i_interpolation: seq(ignored(tag("escape", lit("\\("))), cut(), bind("guard", false, nothing(), rule("exprs")), ignored(tag("escape", lit(")")))),
    i_body: tag("string", regex(/[^"\\]+/)),

    regex: tag("regex", seq(ignored(lit("/")), regex(/(\[([^\]]|\\\])+\]|\\.|[^\\/\n])*/), ignored(lit("/")), regex(/[gimsuvy]*/))), // cSpell: ignore gimsuvy

    boolean: seq(ignored(nothing()), alt(rule("boolean_true"), rule("boolean_false"))),
    boolean_true: kw("boolean", "true", "True", "TRUE"),
    boolean_false: kw("boolean", "false", "False", "FALSE"),

    collection: ssep(rule("blank"), op("punctuation", "["), cut(), bind("guard", false, nothing(), alt(
        rule("empty_collection"),
        joined(ignored(rule("ws_comma")), rule("collection_item"), false, true),
    )), op("punctuation", "]")),
    ws_comma: seq(rule("blank"), rule("comma"), rule("blank")),
    empty_collection: alt(
        rule("empty_list"),
        rule("empty_map"),
    ),
    empty_list: ignored(nothing()),
    empty_map: op("operator", ":"),
    collection_item: alt(
        rule("collection_shorthand"),
        rule("expr"),
    ),
    collection_shorthand: ssep(rule("blank"), ignored(rule("quote")), alt(rule("atom"), rule("par_exp")), op("operator", ":")),

    quasiquote: tag("quoted", ssep(rule("blank"), op("punctuation", "{"), cut(), bind("guard", false, nothing(), rule("exprs")), op("punctuation", "}"))),
    par_exp: ssep(rule("blank"), op("punctuation", "("), cut(), bind("guard", false, nothing(), rule("exprs")), op("punctuation", ")")),
    name: tag("name", regex(/[_\p{L}][_\p{L}\p{N}]*/u)),
};

/** Every highlight tag name used anywhere in {@link backolonGrammar}, collected by walking all of its combinator trees (e.g. for building a syntax-highlight theme). */
export const all_tags = new Set(Object.values(backolonGrammar).map((x): GrammarCombinator => Array.isArray(x) ? x[1] : x as GrammarCombinator).reduce((prev, x) => [...prev, ...walkCombinator(x, undefined, {
    leaf: node => opDefs[node.op].hashFields.flatMap(f => f[1] === MixAction.Tag ? [f[0]] : []).map(f => (node as any)[f]),
    fold: fields => fields.flatMap(x => x[2]),
})], [] as string[]));
// console.log({ all_tags });
// Object.entries(backolonGrammar).forEach(([rule, g]) => {
//     console.log(`${rule}: ${describeCombinator(Array.isArray(g) ? g[1] : g)}`);
// });
