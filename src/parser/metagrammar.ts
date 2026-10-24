import { alt, Grammar, lit, opt, regex, rep, rule, seq } from "./combinator";

/**
 * The metagrammar: a grammar for the textual form of combinators, i.e.
 * the notation {@link describeCombinator} renders. The `describe`
 * function of each operation in {@link opDefs} is the normative source
 * for the form of that operation here.
 *
 * The entry rule is `combinator`, which matches one combinator
 * description. Each form is its own rule, so the CST of a description
 * mirrors the combinator it describes.
 *
 * `describe` is lossy in a few corners, and this grammar inherits that:
 * a keyword's tag, a param/ambient default, a cut's depth, a joined's
 * require2/trailing flags, and an alternatives' first flag are not
 * rendered, so they cannot be recovered from a description either.
 * An empty `()` is likewise ambiguous between an empty sequence and
 * empty alternatives, and a repeat renders its items back to back, so
 * only the single-item form (the only one descriptions of real grammars
 * contain) is recognized here.
 */
export const metaGrammar: Grammar = {
    combinator: rule("postfixed"),

    // A primary, possibly carrying one postfix construction: a
    // separator sequence `sep.@(items)`, a joined repetition
    // `joiner.element+`, or a repetition `item*` / `item+`.
    postfixed: alt(
        seq(rule("primary"), lit(".@("), opt(rule("items")), lit(")")),
        seq(rule("primary"), lit("."), rule("primary"), lit("+")),
        seq(rule("primary"), alt(lit("*"), lit("+"))),
        rule("primary"),
    ),

    primary: alt(
        rule("paren"),
        rule("optional"),
        rule("bind"),
        rule("tag"),
        rule("ignored"),
        rule("literal"),
        rule("rule_ref"),
        rule("param_ref"),
        rule("ambient_ref"),
        rule("cut"),
        rule("eps"),
        rule("die"),
    ),

    // Every form that starts with "(": the lookahead-like forms are
    // distinguished by their two-character prefixes, then come keyword
    // lists, sequences, alternatives, and the empty form.
    paren: alt(
        seq(lit("(?("), rule("combinator"), lit(")"), rule("combinator"), lit(" | "), rule("combinator"), lit(")")),
        seq(lit("(?="), rule("combinator"), lit(")")),
        seq(lit("(?!"), rule("combinator"), lit(")")),
        seq(lit("(??"), rule("combinator"), lit(")")),
        seq(lit("(="), rule("combinator"), lit(")")),
        seq(lit("(#"), rule("combinator"), lit(")")),
        rule("keyword"),
        rule("sequence"),
        rule("alternatives"),
        lit("()"),
    ),

    // `(item item ...)` -- items separated by single spaces.
    sequence: seq(lit("("), rule("items"), lit(")")),
    items: seq(rule("combinator"), rep(false, seq(lit(" "), rule("combinator")))),

    // `(item | item ...)`
    alternatives: seq(lit("("), rule("combinator"), rep(false, seq(lit(" | "), rule("combinator"))), lit(")")),

    // `('word' | 'word' ...)` -- the options of a keyword, single-quoted.
    keyword: seq(lit("("), rule("kw_option"), rep(false, seq(lit(" | "), rule("kw_option"))), lit(")")),
    kw_option: regex(/'[^']*'/),

    // `[item]`
    optional: seq(lit("["), rule("combinator"), lit("]")),

    // `&name=value { body }`
    bind: seq(lit("&"), rule("name"), lit("="), rule("combinator"), lit(" { "), rule("combinator"), lit(" }")),

    // `#tag=item`
    tag: seq(lit("#"), rule("tag_name"), lit("="), rule("combinator")),
    tag_name: regex(/[A-Za-z0-9_-]+/),

    // `,item`
    ignored: seq(lit(","), rule("combinator")),

    literal: alt(rule("string_literal"), rule("regex_literal")),
    // A JSON string, as produced by stringify.
    string_literal: regex(/"(?:\\.|[^"\\])*"/),
    // `/source/flags` -- a source is a run of escape pairs, character
    // classes, and plain characters (anything but a slash or backslash);
    // a class is a run of escape pairs and plain characters (anything
    // but a closing bracket or backslash), so slashes inside a class
    // do not end the literal.
    regex_literal: seq(lit("/"), rep(false, rule("regex_atom")), lit("/"), regex(/[a-z]*/)),
    regex_atom: alt(
        rule("regex_class"),
        regex(/\\./),
        regex(/[^/\\]/),
    ),
    regex_class: seq(lit("["), rep(false, rule("regex_class_atom")), lit("]")),
    regex_class_atom: alt(regex(/\\./), regex(/[^\]\\]/)),

    // `name` or `name{arg}{arg}`
    rule_ref: seq(rule("name"), rep(false, seq(lit("{"), rule("combinator"), lit("}")))),
    // `$name`
    param_ref: seq(lit("$"), rule("name")),
    // `@name`
    ambient_ref: seq(lit("@"), rule("name")),

    cut: lit("!"),
    eps: lit("ε"),

    // `^"message"`
    die: seq(lit("^"), rule("string_literal")),

    name: regex(/[A-Za-z_][A-Za-z0-9_]*/),
};
