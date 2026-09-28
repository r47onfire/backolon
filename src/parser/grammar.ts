import { alternatives, assert_nonempty, assert_sameline, cut, ignored, joined, literal, nothing, optional, regex, repeat, repeat_seq, rule, seq_sep, sequence, tag } from "./combinator";
import { Grammar } from "./parseToCST";

export const backolonGrammar: Grammar = {
    blank: ignored(repeat(false, alternatives(regex(/\s*/), rule("comment")))),
    blank_required: ignored(assert_nonempty(rule("blank"))),
    blank_sameline: ignored(assert_sameline(rule("blank_required"))),

    comment: ignored(tag("comment", alternatives(rule("block_comment"), rule("line_comment")))),
    block_comment: sequence(literal("##[["), repeat(false, alternatives(rule("block_comment"), regex(/./))), literal("##]]")),
    line_comment: regex(/##[^\n]*(\n|$)/),

    expr_sep: ignored(repeat(true, alternatives(rule("semi"), rule("nl")))),
    semi: ignored(tag("punctuation", literal(";"))),
    nl: ignored(sequence(literal("\n"), optional(rule("comment")))),

    exprs: joined(rule("expr_sep"), alternatives(rule("expr"), nothing())),
    toplevel_expr: seq_sep(rule("expr_sep"), rule("expr")),
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

    // simple_expr precedence: pipe -> implicit call -> assignment -> ternary -> logical -> bitwise -> equality -> comparison -> bitshift -> add/sub -> mul/div/mod -> pow -> indexing/dot -> unary operators / explicit function call -> atoms

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
    decimal: regex(/((?!0)\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?/i),

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
    i_escape: tag("escape", alternatives(
        rule("i_known_escape"),
        rule("i_x_escape"),
        rule("i_u_escape"),
        rule("i_U_escape"),
    )),
    i_known_escape: regex(/\\[abefnrtvz"']/), // cSpell: ignore abefnrtvz
    i_x_escape: regex(/\\x[0-9a-f]{2}/),
    i_u_escape: regex(/\\u[0-9a-f]{4}/),
    i_U_escape: regex(/\\U\{[0-9a-f]+\}/),
    i_interpolation: sequence(tag("escape", literal("\\(")), cut(), rule("exprs"), tag("escape", literal(")"))),
    i_body: tag("string", regex(/[^"\\]+/)),

    regex: tag("regex", sequence(literal("/"), rule("regex_body"), literal("/"), rule("regex_flags"))),
    regex_body: regex(/(\[([^\]]|\\\])+\]|\\.|[^\\/\n])*/),
    regex_flags: regex(/[gimsuvy]*/), // cSpell: ignore gimsuvy

    boolean: tag("boolean", regex(/([Tt]rue|[Ff]alse)\b/)), // cSpell: ignore alse

    collection: seq_sep(rule("blank"), literal("["), cut(), rule("exprs"), literal("]")),
    quasiquote: tag("quoted", seq_sep(rule("blank"), literal("{"), cut(), rule("exprs"), literal("}"))),
    par_exp: seq_sep(rule("blank"), literal("("), cut(), rule("exprs"), literal(")")),
    name: tag("name", regex(/[_\p{L}][_\p{L}\p{N}]*/u)),
};

export const all_tags = new Set(Object.values(backolonGrammar).flatMap(function walk(g: any): string[] {
    if (typeof g !== "object") return [];
    return (g.op === "tag" ? [g.tag] : []).concat(Object.values(g).flatMap(walk));
}));
console.log({ all_tags });
