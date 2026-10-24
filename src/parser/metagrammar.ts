import { alt, Grammar, ignored, lit, opt, regex, rep, rule, seq } from "./combinator";

/**
 * The metagrammar: a grammar for the textual form of combinators, i.e.
 * the notation {@link describeCombinator} renders. The `describe`
 * function of each operation in {@link opDefs} is the normative source
 * for the form of that operation here.
 *
 * The entry rule is `combinator`, which matches one combinator
 * description. The rules are layered like the precedence levels of the
 * main grammar: `combinator` is built from `postfixed` (a primary with
 * a postfix construction), which is built from `primary` (the atomic
 * and delimited forms), and each form is its own rule, so the CST of a
 * description mirrors the combinator it describes.
 *
 * Whitespace is insignificant: a `blank` may appear around any
 * structural token, and the canonical single spaces of a fresh
 * description are just the smallest case. Two spellings deserve note:
 * `()` is the empty form, nothing (compare the main grammar, where an
 * empty `exprs` is an empty `begin`), and `(|)` is an alternatives
 * with no options, i.e. `no()`.
 *
 * `describe` is lossy in a few corners, and this grammar inherits
 * that: a keyword's tag, a cut's depth, a joined's require2/trailing
 * flags, and an alternatives' first flag are not rendered, so they
 * cannot be recovered from a description either. (Param and ambient
 * defaults likewise are not rendered.) A repeat renders its items
 * back to back, so only the single-item form -- the only one
 * descriptions of real grammars contain -- is recognized here.
 */
export const metaGrammar: Grammar = {
    combinator: seq(ignored(rule("blank")), rule("postfixed"), ignored(rule("blank"))),

    // A primary, possibly carrying one postfix construction: a
    // separator sequence `sep.@(items)`, a joined repetition
    // `joiner.element+`, or a repetition `item*` / `item+`.
    postfixed: alt(
        seq(rule("primary"), ignored(rule("blank")), lit(".@("), ignored(rule("blank")), opt(rule("items")), ignored(rule("blank")), lit(")")),
        seq(rule("primary"), ignored(rule("blank")), lit("."), ignored(rule("blank")), rule("primary"), ignored(rule("blank")), lit("+")),
        seq(rule("primary"), ignored(rule("blank")), alt(lit("*"), lit("+"))),
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
        rule("nothing"),
        rule("die"),
    ),

    // Every form that starts with "(": the lookahead-like forms are
    // distinguished by their two-character prefixes, then come keyword
    // lists, sequences, and alternatives.
    paren: alt(
        seq(lit("(?("), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit(")"), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit("|"), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit(")")),
        seq(lit("(?="), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit(")")),
        seq(lit("(?!"), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit(")")),
        seq(lit("(??"), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit(")")),
        seq(lit("(="), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit(")")),
        seq(lit("(#"), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit(")")),
        rule("keyword"),
        rule("sequence"),
        rule("alternatives"),
    ),

    // `(item item ...)` -- items separated by blanks.
    sequence: seq(lit("("), ignored(rule("blank")), rule("items"), ignored(rule("blank")), lit(")")),
    items: seq(rule("combinator"), rep(false, seq(ignored(rule("blank")), rule("combinator")))),

    // `(item | item ...)`, or `(|)` for no items at all.
    alternatives: alt(
        seq(lit("("), ignored(rule("blank")), rule("combinator"), rep(false, seq(ignored(rule("blank")), lit("|"), ignored(rule("blank")), rule("combinator"))), ignored(rule("blank")), lit(")")),
        seq(lit("("), ignored(rule("blank")), lit("|"), ignored(rule("blank")), lit(")")),
    ),

    // `('word' | 'word' ...)` -- the options of a keyword, single-quoted.
    keyword: seq(lit("("), ignored(rule("blank")), rule("kw_option"), rep(false, seq(ignored(rule("blank")), lit("|"), ignored(rule("blank")), rule("kw_option"))), ignored(rule("blank")), lit(")")),
    kw_option: regex(/'[^']*'/),

    // `[item]`
    optional: seq(lit("["), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit("]")),

    // `&name=value { body }`, or `&+name=value { body }` for a bind
    // whose value extends the binding it shadows.
    bind: seq(alt(lit("&+"), lit("&")), rule("name"), ignored(rule("blank")), lit("="), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit("{"), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit("}")),

    // `#tag=item`
    tag: seq(lit("#"), rule("tag_name"), ignored(rule("blank")), lit("="), ignored(rule("blank")), rule("combinator")),
    tag_name: regex(/[A-Za-z0-9_-]+/),

    // `,item`
    ignored: seq(lit(","), ignored(rule("blank")), rule("combinator")),

    literal: alt(rule("string_literal"), rule("regex_literal")),
    // A JSON string, as produced by stringify.
    string_literal: regex(/"(?:\\.|[^"\\])*"/),
    // `/source/flags` -- a source is a run of escape pairs, character
    // classes, and plain characters (anything but a slash or
    // backslash); a class is a run of escape pairs and plain
    // characters (anything but a closing bracket or backslash), so
    // slashes inside a class do not end the literal.
    regex_literal: seq(lit("/"), rep(false, rule("regex_atom")), lit("/"), regex(/[a-z]*/)),
    regex_atom: alt(
        rule("regex_class"),
        regex(/\\./),
        regex(/[^/\\]/),
    ),
    regex_class: seq(lit("["), rep(false, rule("regex_class_atom")), lit("]")),
    regex_class_atom: alt(regex(/\\./), regex(/[^\]\\]/)),

    // `name` or `name{arg}{arg}`
    rule_ref: seq(rule("name"), rep(false, seq(ignored(rule("blank")), lit("{"), ignored(rule("blank")), rule("combinator"), ignored(rule("blank")), lit("}")))),
    // `$name`
    param_ref: seq(lit("$"), rule("name")),
    // `@name`
    ambient_ref: seq(lit("@"), rule("name")),

    cut: lit("!"),
    // The epsilon, or the empty form `()`.
    nothing: alt(lit("ε"), seq(lit("("), ignored(rule("blank")), lit(")"))),

    // `^"message"`
    die: seq(lit("^"), ignored(rule("blank")), rule("string_literal")),

    name: regex(/[A-Za-z_][A-Za-z0-9_]*/),
    blank: regex(/\s*/),
};
