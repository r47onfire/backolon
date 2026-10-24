import { alt, Grammar, ignored, lit, opt, regex, rep, rule, seq } from "./combinator";

/**
 * The metagrammar: a grammar for the textual form of combinators, i.e.
 * the notation {@link describeCombinator} renders.
 *
 * Recognized forms:
 *
 * * `"x"` -> `lit("x")`
 * * `/x/f` -> `regex(/x/f)`
 * * `%t=a/b/c/d...` -> `kw(t, a, b, c, d...)` - TODO: implement this in the grammar and describe
 * * `#t=x` -> `tag("t", x)`
 * * `x.@(y)` -> `ssep(x, y...)`
 * * `x.y+` -> `joined(x, y)` - TODO: require2 and trailing flags
 * * `x+` -> `rep(true, x)`
 * * `x*` -> `rep(false, x)`
 * * `x?` -> `opt(x)` - TODO: use this syntax
 * * `(?(x) y // z)` -> `if_(x, y, z)` - TODO: use this syntax
 * * `(?=x)` -> `lookahead(true, x)`
 * * `(?!x)` -> `lookahead(false, x)`
 * * `[x]` -> `try_(x)` - TODO: use this syntax
 * * `(=x)` -> `sameline(x)`
 * * `(+x)` -> `nonempty(x)` - TODO: use this syntax
 * * `!n` -> `cut(n)` - TODO: implement number
 * * `x y z` -> `seq(x, y, z)`
 * * `x | y | z` -> alt(x, y, z)` - TODO: how to denote `alt()` vs `altFirst()`
 * * `<x>` -> `rule("x")` - TODO: implement brackets syntax
 * * `<x(y, z)>` -> `rule("x", y, z...)` - TODO: implement parameter list parsing
 * * `()` -> `nothing()` / `yes()`
 * * `(|)` -> `alt()` / `no()`
 * * `$x` -> `param("x")`
 * * `$x:y` -> `param("x", y)` - TODO: use this syntax
 * * `@x` -> `ambient("x")`
 * * `@x:y` -> `ambient("x", y)` - TODO: use this syntax
 * * `&x=y-z` -> `bind("x", false, y, z)` - TODO: use this syntax
 * * `&+x=y-z` -> `bind("x", true, y, z)` - TODO: use this syntax
 * * `^"x"` -> `die("x")`
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
