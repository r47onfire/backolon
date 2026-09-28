import { alternatives, assert_nonempty, assert_sameline, cut, ignored, joined, literal, nothing, optional, regex, repeat, repeat_seq, rule, seq_sep, sequence, tag } from "./combinator";
import { Grammar } from "./parseToCST";

export const backolonGrammar: Grammar = {
    blank: ignored(repeat(false, alternatives(regex(/\s*/), rule("comment")))),
    blank_required: ignored(assert_nonempty(rule("blank"))),
    blank_sameline: ignored(assert_sameline(rule("blank_required"))),

    comment: ignored(tag("comment", alternatives(rule("block_comment"), rule("line_comment")))),
    block_comment: sequence(literal("##[["), repeat(false, alternatives(rule("block_comment"), regex(/./))), literal("##]]")),
    line_comment: regex(/##[^\n]*(\n|$)/),

    expr_sep: ignored(repeat(true, alternatives(rule("semi"), rule("nl"), rule("comment")))),
    semi: ignored(tag("punctuation", literal(";"))),
    nl: ignored(sequence(literal("\n"), optional(rule("comment")))),

    exprs: repeat(false, seq_sep(rule("expr_sep"), seq_sep(rule("blank"), rule("expr")))),
    toplevel_exprs: assert_nonempty(rule("exprs")),
    toplevel_expr: repeat(true, seq_sep(rule("expr_sep"), seq_sep(rule("blank"), rule("expr")))),
    expr: alternatives(rule("block_expr"), rule("simple_expr")),

    // block_expr: let, if, while, foreach, trycatch, with, fn
    block_expr: alternatives(
        rule("let"),
        rule("if"),
        rule("while"),
        rule("foreach"),
        rule("trycatch"),
        rule("with"),
        rule("fn"),
    ),

    let: seq_sep(rule("blank"), tag("keyword", regex(/\blet\b/)), rule("let_body")),
    if: seq_sep(rule("blank"), tag("keyword", regex(/\bif\b/)), rule("if_body")),
    while: seq_sep(rule("blank"), tag("keyword", regex(/\bwhile\b/)), rule("while_body")),
    foreach: seq_sep(rule("blank"), tag("keyword", regex(/\bforeach\b/)), rule("foreach_body")),
    trycatch: seq_sep(rule("blank"), tag("keyword", regex(/\btry\b/)), rule("trycatch_body")),
    with: seq_sep(rule("blank"), tag("keyword", regex(/\bwith\b/)), rule("with_body")),
    fn: seq_sep(rule("blank"), tag("keyword", regex(/\bfn\b/)), rule("fn_body")),

    simple_expr: rule("pipe"),

    // left associative
    pipe: alternatives(seq_sep(rule("blank"), rule("pipe"), rule("pipe_op"), cut(), rule("implicit_call")), rule("implicit_call")),
    pipe_op: alternatives(
        rule("normal_pipe_op"),
        rule("filter_pipe_op"),
        rule("map_pipe_op"),
        rule("reduce_pipe_op"),
    ),
    normal_pipe_op: tag("operator", literal("|>")),
    filter_pipe_op: tag("operator", literal("|?>")),
    map_pipe_op: tag("operator", literal("|*>")),
    reduce_pipe_op: sequence(tag("operator", literal("|+>")), cut(), tag("operator", literal("[")), rule("exprs"), tag("operator", literal("]"))),

    // right associative
    implicit_call: alternatives(seq_sep(rule("blank_sameline"), rule("kw_arg"), assert_nonempty(rule("implicit_args"))), rule("kw_arg")),
    implicit_args: joined(seq_sep(rule("blank_sameline"), tag("operator", literal(","))), alternatives(rule("implicit_call"), nothing()), false, false), // allow blank arguments

    // non-associative
    kw_arg: alternatives(seq_sep(rule("blank"), rule("assignment"), rule("kw_arg_op"), cut(), rule("assignment")), rule("assignment")),
    kw_arg_op: alternatives(
        rule("kw"),
    ),
    kw: tag("operator", literal(":")),

    // right associative
    assignment: alternatives(seq_sep(rule("blank"), rule("ternary"), rule("assign_op"),cut(),  rule("assignment")), rule("ternary")),
    assign_op: sequence(optional(rule("aug_assign_prefix")), tag("operator", regex(/=(?!=)/))),
    aug_assign_prefix: sequence(alternatives( // wrapped in single sequence so it's kept
        rule("logical_op"),
        rule("bitwise_op"),
        rule("bitshift_op"),
        rule("sum_op"),
        rule("term_op"),
    )),

    // right associative
    ternary: alternatives(seq_sep(rule("blank"), rule("logical"), tag("operator", literal("?")), cut(), rule("assignment"), cut(), tag("operator", literal(":")), rule("ternary")), rule("logical")),

    // left associative
    logical: alternatives(seq_sep(rule("blank"), rule("logical"), rule("logical_op"), cut(), rule("comparison")), rule("comparison")),
    logical_op: alternatives(
        rule("logical_and"),
        rule("logical_or"),
    ),
    logical_and: alternatives(tag("operator", literal("&&")), tag("keyword", regex(/\band\b/))),
    logical_or: alternatives(tag("operator", literal("||")), tag("keyword", regex(/\bor\b/))),

    // chain associative
    comparison: alternatives(joined(seq_sep(rule("blank"), rule("comparison_op")), seq_sep(rule("blank"), rule("bitwise")), true, false), rule("bitwise")),
    comparison_op: alternatives(
        rule("equal_op"),
        rule("not_equal_op"),
        rule("lte_op"),
        rule("gte_op"),
        rule("less_op"),
        rule("greater_op"),
    ),
    equal_op: tag("operator", literal("==")),
    not_equal_op: tag("operator", literal("!=")),
    lte_op: tag("operator", literal("<=")),
    gte_op: tag("operator", literal(">=")),
    less_op: tag("operator", regex(/<(?!<)/)),
    greater_op: tag("operator", regex(/>(?!>)/)),

    // left associative
    bitwise: alternatives(seq_sep(rule("blank"), rule("bitwise"), rule("bitwise_op"), cut(), rule("bitshift")), rule("bitshift")),
    bitwise_op: alternatives(
        rule("bitwise_and"),
        rule("bitwise_or"),
        rule("bitwise_xor"),
    ),
    bitwise_and: tag("operator", literal("&")),
    bitwise_or: tag("operator", literal("|")),
    bitwise_xor: tag("operator", literal("^")),

    // left associative
    bitshift: alternatives(seq_sep(rule("blank"), rule("bitshift"), rule("bitshift_op"), cut(), rule("sum")), rule("sum")),
    bitshift_op: alternatives(
        rule("shift_left"),
        rule("shift_right"),
    ),
    shift_left: tag("operator", literal("<<")),
    shift_right: tag("operator", literal(">>")),

    // left associative
    sum: alternatives(seq_sep(rule("blank"), rule("sum"), rule("sum_op"), cut(), rule("term")), rule("term")),
    sum_op: alternatives(
        rule("add"),
        rule("sub"),
    ),
    add: tag("operator", literal("+")),
    sub: tag("operator", regex(/-(?!>)/)),

    // left associative
    term: alternatives(seq_sep(rule("blank"), rule("term"), rule("term_op"), cut(), rule("factor")), rule("factor")),
    term_op: alternatives(
        rule("mul"),
        rule("div"),
        rule("mod"),
    ),
    mul: tag("operator", regex(/\*(?!\*)/)),
    div: tag("operator", literal("/")),
    mod: tag("operator", literal("%")),

    // right associative
    factor: alternatives(seq_sep(rule("blank"), rule("indexing"), rule("factor_op"), cut(), rule("factor")), rule("indexing")),
    factor_op: alternatives(
        rule("pow"),
    ),
    pow: tag("operator", literal("**")),

    // left associative
    indexing: alternatives(seq_sep(rule("blank"), rule("indexing"), rule("indexing_op"), cut(), rule("primary")), rule("primary")),
    indexing_op: alternatives(
        rule("dot"),
        rule("arrow"),
    ),
    dot: tag("operator", literal(".")),
    arrow: tag("operator", literal("->")),

    // primary: unary operators or atom
    primary: alternatives(
        rule("unary"),
        rule("atom"),
    ),
    // these are all prefix unary
    unary: alternatives(
        rule("explicit_call"),
        rule("prefix"),
    ),

    explicit_call: seq_sep(rule("blank"), rule("primary"), tag("operator", literal("(")), cut(), rule("explicit_args"), tag("operator", literal(")"))),
    explicit_args: repeat_seq(true, alternatives(rule("expr"), nothing()), seq_sep(rule("blank"), tag("operator", literal(",")))), // allow blank arguments

    prefix: seq_sep(rule("blank"), rule("prefix_op"), cut(), rule("factor")),
    prefix_op: alternatives(
        rule("length"),
        rule("spread"),
        rule("negate"),
        rule("abs"),
        rule("not"),
        rule("quote"),
        rule("unquote"),
        rule("unquote_splicing"),
        rule("reference"),
        rule("lazy"),
    ),

    length: tag("operator", literal("#")),
    spread: tag("operator", literal("...")),
    negate: tag("operator", literal("-")),
    abs: tag("operator", literal("+")),
    not: tag("operator", regex(/!(?!=)/)),
    quote: tag("operator", literal("`")),
    unquote: tag("operator", literal("$")),
    unquote_splicing: tag("operator", literal("$.")),
    reference: tag("operator", literal("@")),
    lazy: tag("operator", literal("^")),

    // atoms: number, string, regex, boolean, null, collection literal, quasiquote, parenthesized expression, name
    atom: alternatives(
        rule("number"),
        rule("string"),
        rule("regex"),
        rule("boolean"),
        rule("collection"),
        rule("quasiquote"),
        rule("par_exp"),
        rule("name"),
    ),

    number: tag("number", alternatives(
        rule("hex"),
        rule("bin"),
        rule("decimal"),
    )),
    hex: regex(/0x[a-f0-9]+/i),
    bin: regex(/0b[01]+/i),
    decimal: regex(/((?!0\d)\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?/i),

    string: alternatives(rule("r_string"), rule("i_string")),

    r_string: sequence(tag("string", literal("'")), cut(), repeat(false, rule("r_part")), tag("string", literal("'"))),
    r_part: alternatives(
        rule("r_escape"),
        rule("r_body"),
    ),
    r_escape: tag("escape", regex(/\\./)),
    r_body: tag("string", regex(/[^'\\]+/)),

    i_string: sequence(tag("string", literal("\"")), cut(), repeat(false, rule("i_part")), tag("string", literal("\""))),
    i_part: alternatives(
        rule("i_escape"),
        rule("i_interpolation"),
        rule("i_body"),
    ),
    i_escape: tag("escape", sequence(regex(/\\(?!\()/), cut(), rule("i_escape_body"))),
    i_escape_body: alternatives(
        rule("i_known_escape"),
        rule("i_x_escape"),
        rule("i_u_escape"),
        rule("i_U_escape"),
    ),
    i_known_escape: regex(/[abefnrtvz"']/), // cSpell: ignore abefnrtvz
    i_x_escape: sequence(literal("x"), cut(), regex(/[0-9a-f]{2}/)),
    i_u_escape: sequence(literal("u"), cut(), regex(/[0-9a-f]{4}/)),
    i_U_escape: sequence(literal("U"), cut(), regex(/\{[0-9a-f]+\}/)),
    i_interpolation: sequence(tag("escape", literal("\\(")), cut(), rule("exprs"), tag("escape", literal(")"))),
    i_body: tag("string", regex(/[^"\\]+/)),

    regex: tag("regex", sequence(literal("/"), rule("regex_body"), literal("/"), rule("regex_flags"))),
    regex_body: regex(/(\[([^\]]|\\\])+\]|\\.|[^\\/\n])*/),
    regex_flags: regex(/[gimsuvy]*/), // cSpell: ignore gimsuvy

    boolean: tag("boolean", regex(/\b([Tt]rue|[Ff]alse)\b/)), // cSpell: ignore alse

    collection: seq_sep(rule("blank"), literal("["), cut(), rule("collection_body"), literal("]")),
    collection_body: alternatives(
        rule("empty_collection"),
        joined(tag("operator", literal(",")), rule("collection_item"), false, true), // TODO: allow trailing comma
    ),
    empty_collection: alternatives(
        rule("empty_list"),
        rule("empty_map"),
    ),
    empty_list: nothing(),
    empty_map: tag("operator", literal(":")),
    collection_item: alternatives(
        rule("collection_shorthand"),
        rule("expr"),
    ),
    collection_shorthand: seq_sep(rule("blank"), rule("quote"), tag("operator", literal(":"))),

    quasiquote: tag("quoted", seq_sep(rule("blank"), literal("{"), cut(), rule("exprs"), literal("}"))),
    par_exp: seq_sep(rule("blank"), literal("("), cut(), rule("exprs"), literal(")")),
    name: tag("name", regex(/[_\p{L}][_\p{L}\p{N}]*/u)),
};

export const all_tags = new Set(Object.values(backolonGrammar).flatMap(function walk(g: any): string[] {
    if (typeof g !== "object") return [];
    return (g.op === "tag" ? [g.tag] : []).concat(Object.values(g).flatMap(walk));
}));
console.log({ all_tags });
