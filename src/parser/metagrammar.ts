import { alt, Grammar, ignored, lit, lookahead, opt, regex, rep, rule, seq } from "./combinator";

/**
 * The metagrammar: a grammar for the textual form of combinators and
 * of whole grammars written as text. The `describe` function of each
 * operation in {@link opDefs} is the normative source for the
 * combinator forms; the rule-definition layer on top is modeled on
 * Pegase's metagrammar (a grammar is a sequence of `name: body`
 * definitions, bodies are layered alternatives over sequences over
 * postfixed primaries).
 *
 * Every form is its own rule, so a metacompiler can lower the CST
 * rule by rule into combinator calls.
 *
 * Entry rules:
 *
 * * `grammar` matches a whole grammar text: rule definitions
 *   separated by blanks.
 * * `rule_definition` matches one definition: a name, an optional
 *   parameter list, a colon, and a body -- e.g. `foo: bar baz` or
 *   `baz(x): abc $x`.
 * * `combinator` matches one combinator (a rule body): alternatives
 *   of sequences of postfixed primaries, the parenthesized forms
 *   being how sequences and alternatives nest.
 *
 * Whitespace is insignificant: a `blank` may appear around any
 * structural token, and the canonical single spaces of a fresh
 * description are just the smallest case.
 *
 * Recognized forms:
 *
 * * `"x"` -> `lit("x")`
 * * `/x/f` -> `regex(/x/f)`
 * * `%t=a/b/c/d...` -> `kw(t, a, b, c, d...)`
 * * `#t=x` -> `tag("t", x)`
 * * `,x` -> `ignored(x)`
 * * `x.@(y)` -> `ssep(x, y...)`
 * * `x.y+` -> `joined(x, y)` - TODO: require2 and trailing flags
 * * `x+` -> `rep(true, x)`
 * * `x*` -> `rep(false, x)`
 * * `x?` -> `opt(x)`
 * * `(?(x) y // z)` -> `if_(x, y, z)`
 * * `(?=x)` -> `lookahead(true, x)`
 * * `(?!x)` -> `lookahead(false, x)`
 * * `[x]` -> `try_(x)`
 * * `(=x)` -> `sameline(x)`
 * * `(+x)` -> `nonempty(x)`
 * * `!n` -> `cut(n)` (a bare `!` is `cut(1)`)
 * * `x y z` -> `seq(x, y, z)`
 * * `x | y | z` -> `alt(x, y, z)` - TODO: how to denote `alt()` vs `altFirst()`
 * * `<x>` -> `rule("x")`; a bare `x` in a body is the same reference
 * * `<x(y, z)>` -> `rule("x", y, z...)`; bare `x(y, z)` likewise
 * * `()` -> `nothing()` / `yes()`
 * * the epsilon sign -> `nothing()`
 * * `(|)` -> `alt()` / `no()`
 * * `$x` -> `param("x")`
 * * `$x:y` -> `param("x", y)`
 * * `@x` -> `ambient("x")`
 * * `@x:y` -> `ambient("x", y)`
 * * `&x=y-z` -> `bind("x", false, y, z)`
 * * `&+x=y-z` -> `bind("x", true, y, z)`
 * * `^"x"` -> `die("x")`
 *
 * Postfixes bind to the primary on their left, and a postfix's own
 * operand slots are primaries again, so composite operands are
 * parenthesized -- exactly the shapes `describe` emits. Two choices
 * worth noting: a postfix operator following a `#t=` tag or a bind
 * body belongs to that form's operand (so `#t=x?` is a tag of an
 * optional, not an optional tag), and a rule reference's argument
 * list binds even across a blank (`x (y)` is a call, like Pegase).
 */
export const metaGrammar: Grammar = {
    // A whole grammar text: rule definitions separated by blanks.
    grammar: seq(ignored(rule("blank")), rep(false, seq(rule("rule_definition"), ignored(rule("blank"))))),

    // `name: body`, or `name(param, ...): body` for a parameterized
    // rule. The body is an alternatives; it ends where the next
    // definition begins because a bare rule reference may not be a
    // definition header (see rule_ref).
    rule_definition: seq(rule("name"), ignored(rule("blank")), opt(rule("param_list")), ignored(rule("blank")), lit(":"), rule("alternatives")),

    // One combinator: alternatives of sequences of postfixed
    // primaries, with blanks tolerated at the edges.
    combinator: seq(ignored(rule("blank")), rule("alternatives"), ignored(rule("blank"))),
    alternatives: seq(ignored(rule("blank")), rule("alt_options"), ignored(rule("blank"))),
    alt_options: seq(rule("sequence"), rep(false, seq(ignored(rule("blank")), lit("|"), ignored(rule("blank")), rule("sequence")))),
    sequence: seq(rule("postfixed"), rep(false, seq(ignored(rule("blank")), rule("postfixed")))),

    // A primary with its postfix constructions, applied left to
    // right: `x.@(items)` (ssep), `x.y+` (joined), `x*` / `x+`
    // (repeat), `x?` (opt).
    postfixed: alt(
        seq(rule("primary"), rep(true, seq(ignored(rule("blank")), rule("postfix")))),
        rule("primary"),
    ),
    postfix: alt(
        rule("ssep_post"),
        rule("joined_post"),
        rule("repeat_post"),
        rule("opt_post"),
    ),
    opt_post: lit("?"),
    repeat_post: alt(lit("*"), lit("+")),
    ssep_post: seq(lit(".@("), ignored(rule("blank")), opt(rule("items")), ignored(rule("blank")), lit(")")),
    items: seq(rule("postfixed"), rep(false, seq(ignored(rule("blank")), rule("postfixed")))),
    // The joined element may carry postfixes of its own, except a
    // bare `+`: the final `+` of the joined form is the terminator,
    // so `x.y+` is unambiguous and `x.y++` a repeat of a joined.
    joined_post: seq(lit("."), ignored(rule("blank")), rule("joined_element"), ignored(rule("blank")), lit("+")),
    joined_element: seq(rule("primary"), rep(false, seq(ignored(rule("blank")), alt(rule("opt_post"), rule("star_post"), rule("ssep_post"))))),
    star_post: lit("*"),

    primary: alt(
        rule("if_form"),
        rule("lookahead_pos"),
        rule("lookahead_neg"),
        rule("sameline_form"),
        rule("nonempty_form"),
        rule("empty_alt_form"),
        rule("paren"),
        rule("try_form"),
        rule("keyword_form"),
        rule("bind_form"),
        rule("tag_form"),
        rule("ignored_form"),
        rule("literal"),
        rule("rule_ref"),
        rule("param_ref"),
        rule("ambient_ref"),
        rule("cut_form"),
        rule("nothing_form"),
        rule("die_form"),
    ),

    // The parenthesized forms. Composite operands of the prefix
    // forms are primaries (parenthesized when composite), exactly as
    // describe renders them.
    if_form: seq(lit("(?("), rule("postfixed"), lit(")"), ignored(rule("blank")), rule("postfixed"), ignored(rule("blank")), lit("//"), ignored(rule("blank")), rule("postfixed"), lit(")")),
    lookahead_pos: seq(lit("(?="), rule("postfixed"), lit(")")),
    lookahead_neg: seq(lit("(?!"), rule("postfixed"), lit(")")),
    sameline_form: seq(lit("(="), rule("postfixed"), lit(")")),
    nonempty_form: seq(lit("(+"), rule("postfixed"), lit(")")),
    // `(|)`: an alternatives with no options.
    empty_alt_form: seq(lit("("), ignored(rule("blank")), lit("|"), ignored(rule("blank")), lit(")")),
    // A parenthesized body: grouping for sequences and alternatives.
    paren: seq(lit("("), rule("alternatives"), lit(")")),

    // `[x]`
    try_form: seq(lit("["), rule("alternatives"), lit("]")),

    // `%tag=option/option/...`
    keyword_form: seq(lit("%"), rule("name"), ignored(rule("blank")), lit("="), ignored(rule("blank")), rule("kw_options")),
    kw_options: seq(rule("kw_option"), rep(false, seq(lit("/"), rule("kw_option")))),
    kw_option: regex(/[^/\s|()<>\[\],]+/),

    // `&name=value-body`, or `&+name=value-body` for a bind whose
    // value extends the binding it shadows. The value and the body
    // are both primaries-with-postfixes, so a composite body is
    // parenthesized and `-` is unambiguous.
    bind_form: seq(alt(lit("&+"), lit("&")), rule("name"), ignored(rule("blank")), lit("="), ignored(rule("blank")), rule("postfixed"), ignored(rule("blank")), lit("-"), ignored(rule("blank")), rule("postfixed")),

    // `#tag=item`
    tag_form: seq(lit("#"), rule("tag_name"), ignored(rule("blank")), lit("="), ignored(rule("blank")), rule("postfixed")),
    tag_name: regex(/[A-Za-z0-9_-]+/),

    // `,item`
    ignored_form: seq(lit(","), ignored(rule("blank")), rule("postfixed")),

    literal: alt(rule("string_literal"), rule("regex_literal")),
    // A JSON string, as produced by stringify.
    string_literal: regex(/"(?:\\.|[^"\\])*"/),
    // `/source/flags` -- a source is a nonempty run of escape pairs,
    // character classes, and plain characters (anything but a slash
    // or backslash); a class is a run of escape pairs and plain
    // characters (anything but a closing bracket or backslash), so
    // slashes inside a class do not end the literal. (Requiring a
    // nonempty source keeps `//`, the if form's separator, from
    // lexing as an empty regex.)
    regex_literal: seq(lit("/"), rep(true, rule("regex_atom")), lit("/"), regex(/[a-z]*/)),
    regex_atom: alt(
        rule("regex_class"),
        regex(/\\./),
        regex(/[^/\\]/),
    ),
    regex_class: seq(lit("["), rep(false, rule("regex_class_atom")), lit("]")),
    regex_class_atom: alt(regex(/\\./), regex(/[^\]\\]/)),

    // `<name>` or `<name(arg, ...)>`; a bare `name` or `name(arg,
    // ...)` in a body is the same reference, but a bare reference
    // may not look like a rule definition header -- that lookahead
    // (borrowed from Pegase's metagrammar) is what lets a rule body
    // end where the next definition begins.
    rule_ref: alt(
        seq(lit("<"), ignored(rule("blank")), rule("name"), opt(rule("arg_list")), ignored(rule("blank")), lit(">")),
        seq(lookahead(false, rule("definition_header")), rule("name"), opt(rule("arg_list"))),
    ),
    definition_header: seq(rule("name"), ignored(rule("blank")), opt(rule("param_list")), ignored(rule("blank")), lit(":")),
    // Arguments are single combinators (postfixed level): a
    // composite argument is parenthesized, as describe renders it.
    // (Parsing arguments at the alternatives level would make the
    // separating commas ambiguous with the ignored form `,x`.)
    arg_list: seq(lit("("), ignored(rule("blank")), opt(seq(rule("postfixed"), rep(false, seq(ignored(rule("blank")), lit(","), ignored(rule("blank")), rule("postfixed"))))), ignored(rule("blank")), lit(")")),
    param_list: seq(lit("("), ignored(rule("blank")), opt(seq(rule("name"), rep(false, seq(ignored(rule("blank")), lit(","), ignored(rule("blank")), rule("name"))))), ignored(rule("blank")), lit(")")),

    // `$name` or `$name:default`
    param_ref: seq(lit("$"), rule("name"), opt(seq(ignored(rule("blank")), lit(":"), rule("postfixed")))),
    // `@name` or `@name:default`
    ambient_ref: seq(lit("@"), rule("name"), opt(seq(ignored(rule("blank")), lit(":"), rule("postfixed")))),

    // `!` with an optional depth: `!2`, or a bare `!` for depth 1.
    cut_form: seq(lit("!"), opt(rule("number"))),
    number: regex(/[0-9]+/),

    // The epsilon sign, or the empty form `()`.
    nothing_form: alt(lit("ε"), seq(lit("("), ignored(rule("blank")), lit(")"))),

    // `^"message"`
    die_form: seq(lit("^"), ignored(rule("blank")), rule("string_literal")),

    name: regex(/[A-Za-z_][A-Za-z0-9_]*/),
    blank: regex(/\s*/),
};
