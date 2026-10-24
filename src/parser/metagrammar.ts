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
 * * `;x` -> `ignored(x)`
 * * `x.@(y)` -> `ssep(x, y...)`
 * * `x.y+` -> `joined(x, y)`; the `+` may carry flags: `+2` requires
 *   at least two elements, `+t` permits a trailing joiner, `+2t` both
 *   (a closed set of flags, not a repetition count)
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
 * * `x | y | z` -> `alt(x, y, z)`
 * * `x || y || z` -> `altFirst(x, y, z)`
 * * `<x>` -> `rule("x")`; a bare `x` in a body is the same reference
 * * `<x(y, z)>` -> `rule("x", y, z...)`; bare `x(y, z)` likewise
 * * `()` -> `nothing()` / `yes()`
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
// The tower rules below are shaped like the main grammar's
// precedence levels: each is an alt of a construction branch and a
// delegation to the next level down, and the construction branch
// requires its distinguishing content (at least one separator, at
// least one postfix). A lone operand therefore falls through every
// level untouched -- a rule whose result is already a typed node
// does not nest (see the rule operation) -- and a level node
// appears only when the level actually grouped something. The
// separator-and-item tails are written `item, rep(false, item)`
// rather than `rep(true, item)`: a rep that starts at the end of
// the text succeeds empty without ever trying its item, which
// would let the construction match a lone operand there.
const alt_item = seq(ignored(rule("blank")), ignored(lit("|")), ignored(rule("blank")), rule("postfixed"));
const first_alt_item = seq(ignored(rule("blank")), ignored(lit("||")), ignored(rule("blank")), rule("postfixed"));
const seq_item = seq(ignored(rule("blank")), rule("postfixed"));
const postfix_part = seq(ignored(rule("blank")), rule("postfix"));

export const metaGrammar: Grammar = {
    // A whole grammar text: rule definitions separated by blanks.
    grammar: seq(ignored(rule("blank")), rep(false, seq(rule("rule_definition"), ignored(rule("blank"))))),

    // `name: body`, or `name(param, ...): body` for a parameterized
    // rule. The body ends where the next definition begins because
    // a bare rule reference may not be a definition header (see
    // rule_ref).
    rule_definition: seq(rule("name"), ignored(rule("blank")), opt(rule("param_list")), ignored(rule("blank")), ignored(lit(":")), ignored(rule("blank")), rule("body")),

    // One combinator. A body is a sequence or an alternatives,
    // never a mix -- `a | b c` is a parse error -- so grouping is
    // always explicit: an alternative inside a sequence, or a
    // sequence inside an alternative, is parenthesized (which is
    // also how describe renders them).
    combinator: rule("body"),
    body: alt(rule("alternatives"), rule("first_alternatives"), rule("sequence")),
    alternatives: alt(
        seq(rule("postfixed"), alt_item, rep(false, alt_item)),
        rule("postfixed"),
    ),
    // An alternatives whose options are tried in order, first match
    // wins, instead of longest match.
    first_alternatives: alt(
        seq(rule("postfixed"), first_alt_item, rep(false, first_alt_item)),
        rule("postfixed"),
    ),
    sequence: alt(
        seq(rule("postfixed"), seq_item, rep(false, seq_item)),
        rule("postfixed"),
    ),

    // A primary with its postfix constructions, applied left to
    // right: `x.@(items)` (ssep), `x.y+` (joined), `x*` / `x+`
    // (repeat), `x?` (opt). With no postfix the primary itself is
    // the result.
    postfixed: alt(
        seq(rule("primary"), postfix_part, rep(false, postfix_part)),
        rule("primary"),
    ),
    postfix: alt(
        rule("ssep"),
        rule("joined"),
        rule("repeat_opt"),
        rule("repeat_req"),
        rule("opt"),
    ),
    opt: lit("?"),
    repeat_opt: lit("*"),
    repeat_req: lit("+"),
    ssep: seq(ignored(lit(".@(")), ignored(rule("blank")), opt(rule("items")), ignored(rule("blank")), ignored(lit(")"))),
    items: seq(rule("postfixed"), rep(false, seq(ignored(rule("blank")), rule("postfixed")))),
    // The joined element may carry postfixes of its own, except a
    // bare `+`: the final `+` of the joined form is the terminator,
    // so `x.y+` is unambiguous and `x.y++` a repeat of a joined.
    joined: seq(ignored(lit(".")), ignored(rule("blank")), rule("joined_element"), ignored(rule("blank")), ignored(lit("+")), opt(rule("joined_flags"))),
    // The flags on a joined's `+`, attached with no blank: `2`
    // (at least two elements), `t` (a trailing joiner is allowed),
    // or both. A closed set, not a count.
    joined_flags: alt(lit("2t"), lit("t2"), lit("2"), lit("t")),
    joined_element: seq(rule("primary"), rep(false, seq(ignored(rule("blank")), alt(rule("opt"), rule("star"), rule("ssep"))))),
    star: lit("*"),

    primary: alt(
        rule("if"),
        rule("lookahead_pos"),
        rule("lookahead_neg"),
        rule("sameline"),
        rule("nonempty"),
        rule("empty_alt"),
        rule("paren"),
        rule("try"),
        rule("keyword"),
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

    // The parenthesized forms. Composite operands of the prefix
    // forms are primaries (parenthesized when composite), exactly as
    // describe renders them.
    if: seq(ignored(lit("(?(")), rule("postfixed"), ignored(lit(")")), ignored(rule("blank")), rule("postfixed"), ignored(rule("blank")), ignored(lit("//")), ignored(rule("blank")), rule("postfixed"), ignored(lit(")"))),
    lookahead_pos: seq(ignored(lit("(?=")), rule("postfixed"), ignored(lit(")"))),
    lookahead_neg: seq(ignored(lit("(?!")), rule("postfixed"), ignored(lit(")"))),
    sameline: seq(ignored(lit("(=")), rule("postfixed"), ignored(lit(")"))),
    nonempty: seq(ignored(lit("(+")), rule("postfixed"), ignored(lit(")"))),
    // `(|)`: an alternatives with no options.
    empty_alt: ignored(seq(lit("("), rule("blank"), lit("|"), rule("blank"), lit(")"))),
    // A parenthesized body: grouping for sequences and alternatives.
    paren: seq(ignored(lit("(")), ignored(rule("blank")), rule("body"), ignored(rule("blank")), ignored(lit(")"))),

    // `[x]`
    try: seq(ignored(lit("[")), ignored(rule("blank")), rule("body"), ignored(rule("blank")), ignored(lit("]"))),

    // `%tag=option/option/...`
    keyword: seq(ignored(lit("%")), rule("name"), ignored(rule("blank")), ignored(lit("=")), ignored(rule("blank")), rule("kw_options")),
    kw_options: seq(rule("kw_option"), rep(false, seq(ignored(lit("/")), rule("kw_option")))),
    kw_option: regex(/[^/\s|()<>\[\],]+/),

    // `&name=value-body`, or `&+name=value-body` for a bind whose
    // value extends the binding it shadows. The value and the body
    // are both primaries-with-postfixes, so a composite body is
    // parenthesized and `-` is unambiguous.
    bind: seq(alt(lit("&+"), lit("&")), rule("name"), ignored(rule("blank")), ignored(lit("=")), ignored(rule("blank")), rule("postfixed"), ignored(rule("blank")), ignored(lit("-")), ignored(rule("blank")), rule("postfixed")),

    // `#tag=item`
    tag: seq(ignored(lit("#")), rule("tag_name"), ignored(rule("blank")), ignored(lit("=")), ignored(rule("blank")), rule("postfixed")),
    tag_name: regex(/[A-Za-z0-9_-]+/),

    // `;item` -- a semicolon, not a comma, so the comma stays free
    // for argument lists.
    ignored: seq(ignored(lit(";")), ignored(rule("blank")), rule("postfixed")),

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
    regex_literal: seq(ignored(lit("/")), rep(true, rule("regex_atom")), ignored(lit("/")), regex(/[a-z]*/)),
    regex_atom: alt(
        rule("regex_class"),
        regex(/\\./),
        regex(/[^/\\]/),
    ),
    regex_class: seq(ignored(lit("[")), rep(false, rule("regex_class_atom")), ignored(lit("]"))),
    regex_class_atom: alt(regex(/\\./), regex(/[^\]\\]/)),

    // `<name>` or `<name(arg, ...)>`; a bare `name` or `name(arg,
    // ...)` in a body is the same reference, but a bare reference
    // may not look like a rule definition header -- that lookahead
    // (borrowed from Pegase's metagrammar) is what lets a rule body
    // end where the next definition begins.
    rule_ref: alt(
        seq(ignored(lit("<")), ignored(rule("blank")), rule("name"), opt(rule("arg_list")), ignored(rule("blank")), ignored(lit(">"))),
        seq(lookahead(false, rule("definition_header")), rule("name"), opt(rule("arg_list"))),
    ),
    definition_header: seq(rule("name"), ignored(rule("blank")), opt(rule("param_list")), ignored(rule("blank")), ignored(lit(":"))),
    // Arguments are bodies, comma-separated. (With the ignored form
    // spelled `;x`, nothing in a body can be mistaken for the comma
    // that separates arguments.)
    arg_list: seq(ignored(lit("(")), ignored(rule("blank")), opt(seq(rule("body"), rep(false, seq(ignored(rule("blank")), ignored(lit(",")), ignored(rule("blank")), rule("body"))))), ignored(rule("blank")), ignored(lit(")"))),
    param_list: seq(ignored(lit("(")), ignored(rule("blank")), opt(seq(rule("name"), rep(false, seq(ignored(rule("blank")), ignored(lit(",")), ignored(rule("blank")), rule("name"))))), ignored(rule("blank")), ignored(lit(")"))),

    // `$name` or `$name:default`
    param_ref: seq(ignored(lit("$")), rule("name"), opt(seq(ignored(rule("blank")), ignored(lit(":")), rule("postfixed")))),
    // `@name` or `@name:default`
    ambient_ref: seq(ignored(lit("@")), rule("name"), opt(seq(ignored(rule("blank")), ignored(lit(":")), rule("postfixed")))),

    // `!` with an optional depth: `!2`, or a bare `!` for depth 1.
    cut: seq(ignored(lit("!")), opt(rule("number"))),
    number: regex(/[0-9]+/),

    // The empty form `()`.
    nothing: ignored(seq(lit("("), rule("blank"), lit(")"))),

    // `^"message"`
    die: seq(ignored(lit("^")), ignored(rule("blank")), rule("string_literal")),

    name: regex(/[A-Za-z_][A-Za-z0-9_]*/),
    blank: regex(/\s*/),
};
