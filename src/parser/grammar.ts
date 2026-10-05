import { alt, cut, eps, ignored, joined, lit, lookahead, nonempty, opt, regex, rep, rule, sameline, seq, ssep, tag, try_ } from "./combinator";
import { Grammar } from "./parseToCST";
// import { describe } from "./debug";

export const backolonGrammar: Grammar = {
    blank: ignored(rep(false, alt(regex(/\s*/), rule("comment")))),
    blank_required: ignored(nonempty(rule("blank"))),
    blank_sameline: ignored(sameline(rule("blank_required"))),

    comment: ignored(tag("comment", alt(rule("block_comment"), rule("line_comment")))),
    block_comment: seq(lit("##[["), rep(false, alt(rule("block_comment"), regex(/./))), lit("##]]")),
    line_comment: regex(/##[^\n]*(\n|$)/),

    expr_sep: ignored(rep(true, alt(rule("semi"), rule("nl"), rule("comment")))),
    semi: ignored(tag("punctuation", lit(";"))),
    nl: lit("\n"),
    comma: ignored(tag("punctuation", lit(","))),

    exprs: rep(false, ssep(rule("expr_sep"), ssep(rule("blank"), rule("expr")))),
    toplevel_exprs: nonempty(rule("exprs")),
    toplevel_expr: rep(true, ssep(rule("expr_sep"), ssep(rule("blank"), rule("expr")))),
    expr: alt(rule("block_expr"), rule("simple_expr")),

    // block_expr: let, if, while, foreach, trycatch, with, fn
    block_expr: alt(
        rule("let"),
        rule("if"),
        rule("while"),
        rule("foreach"),
        rule("trycatch"),
        rule("with"),
        rule("fn"),
    ),

    let: ssep(rule("blank"), tag("keyword", regex(/\blet\b/)), rule("let_body")),
    let_body: seq(
        rule("implicit_args"),
        opt(rule("body_exprs")),
    ),

    if: ssep(rule("blank"), tag("keyword", regex(/\bif\b/)), rule("if_body")),


    while: ssep(rule("blank"), tag("keyword", regex(/\bwhile\b/)), rule("while_body")),


    foreach: ssep(rule("blank"), tag("keyword", regex(/\bforeach\b/)), rule("foreach_body")),


    trycatch: ssep(rule("blank"), tag("keyword", regex(/\btry\b/)), rule("trycatch_body")),


    with: ssep(rule("blank"), tag("keyword", regex(/\bwith\b/)), rule("with_body")),


    fn: ssep(rule("blank"), tag("keyword", regex(/\bfn\b/)), rule("fn_body")),


    soft_keyword: alt(
        regex(/\b(in|end|else|catch|finally)\b/),
    ),

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
    reduce_pipe: seq(tag("operator", lit("|+>")), cut(), tag("operator", lit("[")), rule("exprs"), tag("operator", lit("]"))),

    // right associative
    // implicit call is speculative since it's implicit, so if the arguments can't be parsed for any reason, give up and try kw_arg
    implicit_call: alt(ssep(rule("blank_sameline"), rule("kw_arg"), try_(nonempty(rule("implicit_args")))), rule("kw_arg")),
    implicit_args: seq(
        // can't use joined() here since the first and second are different + there are lookahead assertions!
        lookahead(false, rule("soft_keyword")),
        rule("implicit_call"),
        rep(false, seq(
            ignored(ssep(rule("blank_sameline"), rule("comma"))),
            lookahead(false, rule("soft_keyword")),
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
    ),

    // right associative
    ternary: alt(ssep(rule("blank"), rule("logical"), tag("operator", lit("?")), cut(), rule("assignment"), cut(), tag("operator", lit(":")), rule("ternary")), rule("logical")),

    // left associative
    logical: alt(ssep(rule("blank"), rule("logical"), rule("logical_op"), cut(), rule("comparison")), rule("comparison")),
    logical_op: alt(
        rule("logical_and"),
        rule("logical_or"),
    ),
    logical_and: alt(tag("operator", lit("&&")), tag("keyword", regex(/\band\b/))),
    logical_or: alt(tag("operator", lit("||")), tag("keyword", regex(/\bor\b/))),

    // chain associative
    comparison: alt(joined(ssep(rule("blank"), rule("comparison_op")), ssep(rule("blank"), rule("bitwise")), true, false), rule("bitwise")),
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
    bitwise: alt(ssep(rule("blank"), rule("bitwise"), rule("bitwise_op"), cut(), rule("bitshift")), rule("bitshift")),
    bitwise_op: alt(
        rule("bitwise_and"),
        rule("bitwise_or"),
        rule("bitwise_xor"),
    ),
    bitwise_and: tag("operator", lit("&")),
    bitwise_or: tag("operator", regex(/\|(?![?*+>])/)),
    bitwise_xor: tag("operator", lit("^")),

    // left associative
    bitshift: alt(ssep(rule("blank"), rule("bitshift"), rule("bitshift_op"), cut(), rule("sum")), rule("sum")),
    bitshift_op: alt(
        rule("shift_left"),
        rule("shift_right"),
    ),
    shift_left: tag("operator", lit("<<")),
    shift_right: tag("operator", lit(">>")),

    // left associative
    sum: alt(ssep(rule("blank"), rule("sum"), rule("sum_op"), cut(), rule("term")), rule("term")),
    sum_op: alt(
        rule("add"),
        rule("sub"),
    ),
    add: tag("operator", lit("+")),
    sub: tag("operator", regex(/-(?!>)/)),

    // left associative
    term: alt(ssep(rule("blank"), rule("term"), rule("term_op"), cut(), rule("factor")), rule("factor")),
    term_op: alt(
        rule("mul"),
        rule("div"),
        rule("mod"),
    ),
    mul: tag("operator", regex(/\*(?!\*)/)),
    div: tag("operator", lit("/")),
    mod: tag("operator", lit("%")),

    // right associative
    factor: alt(ssep(rule("blank"), rule("indexing"), rule("factor_op"), cut(), rule("factor")), rule("indexing")),
    factor_op: alt(
        rule("pow"),
    ),
    pow: tag("operator", lit("**")),

    // left associative
    indexing: alt(ssep(rule("blank"), rule("indexing"), rule("indexing_op"), cut(), rule("primary")), rule("primary")),
    indexing_op: alt(
        rule("dot"),
        rule("arrow"),
    ),
    dot: tag("operator", lit(".")),
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
        joined(
            ignored(ssep(rule("blank"), rule("comma"))),
            alt(rule("expr"), rule("empty_arg")),
            false, false,
        ),
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
    i_interpolation: seq(tag("escape", lit("\\(")), cut(), rule("exprs"), tag("escape", lit(")"))),
    i_body: tag("string", regex(/[^"\\]+/)),

    regex: tag("regex", seq(lit("/"), rule("regex_body"), lit("/"), rule("regex_flags"))),
    regex_body: regex(/(\[([^\]]|\\\])+\]|\\.|[^\\/\n])*/),
    regex_flags: regex(/[gimsuvy]*/), // cSpell: ignore gimsuvy

    boolean: tag("boolean", regex(/\b([Tt]rue|[Ff]alse)\b/)), // cSpell: ignore alse

    collection: ssep(rule("blank"), ignored(tag("operator", lit("["))), cut(), rule("collection_body"), ignored(tag("operator", lit("]")))),
    collection_body: alt(
        rule("empty_collection"),
        joined(ignored(ssep(rule("blank"), rule("comma"))), rule("collection_item"), false, true), // TODO: allow trailing comma
    ),
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

    quasiquote: tag("quoted", ssep(rule("blank"), ignored(tag("operator", lit("{"))), cut(), rule("exprs"), ignored(tag("operator", lit("}"))))),
    par_exp: ssep(rule("blank"), ignored(tag("operator", lit("("))), cut(), rule("exprs"), ignored(tag("operator", lit(")")))),
    name: tag("name", regex(/[_\p{L}][_\p{L}\p{N}]*/u)),
};

export const all_tags = new Set(Object.values(backolonGrammar).flatMap(function walk(g: any): string[] {
    if (typeof g !== "object") return [];
    return (g.op === "tag" ? [g.v] : []).concat(Object.values(g).flatMap(walk));
}));
// console.log({ all_tags });
// Object.entries(backolonGrammar).forEach(([rule, g]) => {
//     console.log(`    ${rule}: ${describe(g)}`);
// });
