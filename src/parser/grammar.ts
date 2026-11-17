import {
    adopt,
    alt,
    altFirst,
    ambient,
    bind,
    cut,
    defineGrammar,
    donate,
    if_,
    ignored,
    joined,
    kw,
    lit,
    lookahead,
    MixAction,
    no,
    nonempty,
    nothing,
    op,
    opDefs,
    opt,
    param,
    regex,
    rep,
    rule,
    sameline,
    seq,
    ssep,
    tag,
    try_,
    walkCombinator,
    yes,
} from "@r47onfire/nebula";
import { Callable } from "../obj/monkey";
import { objectValues } from "../utils";

// TODO: add rocket operator => - what precedence? what does it even do?
// TODO: tweak strong blocks to allow do and begin blocks to be passed to a parameter to an implicit call

/**
 * The Backolon grammar.
 *
 * The expression rules form a precedence chain from loosest to tightest:
 *
 * - `expr`
 * - `cascade`
 * - `pipe`
 * - `implicit_call`
 * - `assign_rev`
 * - `assignment`
 * - `ternary`
 * - `logical`
 * - `comparison`
 * - `predicate`
 * - `containment`
 * - `bitwise`
 * - `bitshift`
 * - `sum`
 * - `term`
 * - `factor`
 * - `indexing`
 * - `primary`
 *
 * Binary levels are written left-recursively (the parser grows the recursion),
 * and after matching an operator each level first checks a negative lookahead
 * on `assign_op` -- so `a += b` is not misread as a binary `+` followed by a
 * prefix `=` assignment -- and then cuts to commit the level.
 */
export const backolonGrammar = defineGrammar<{ run?: Callable }>({
    blank: { def: ignored(rep(false, alt(regex(/\s*/), rule("comment")))) },
    blank_required: { def: ignored(nonempty(rule("blank"))) },
    blank_sameline: { def: ignored(sameline(rule("blank_required"))) },
    comment: {
        def: ignored(
            tag("comment", alt(rule("block_comment"), rule("line_comment"))),
        ),
    },
    block_comment: {
        def: seq(
            lit("##[["),
            rep(
                false,
                alt(
                    rule("block_comment"),
                    seq(lookahead(false, lit("##]]")), regex(/((?!##).)+|./s)),
                ),
            ),
            lit("##]]"),
        ),
    },
    line_comment: { def: regex(/##(?!\[\[)[^\n]*(\n|$)/) },
    expr_sep: {
        def: ignored(rep(true, alt(rule("semi"), rule("nl"), rule("comment")))),
    },
    semi: { def: op("punctuation", ";") },
    nl: { def: lit("\n") },
    comma: { def: op("punctuation", ",") },
    exprs: {
        def: seq(
            rep(
                false,
                seq(
                    ignored(opt(rule("expr_sep"))),
                    ignored(opt(rule("blank"))),
                    ignored(ambient("guard", nothing())),
                    rule("expr"),
                ),
            ),
            ignored(opt(rule("expr_sep"))),
        ),
    },
    toplevel_exprs: { def: nonempty(rule("exprs")) },
    toplevel_expr: {
        def: rep(
            true,
            seq(
                ignored(opt(rule("expr_sep"))),
                ignored(opt(rule("blank"))),
                rule("expr"),
            ),
        ),
    },
    expr: {
        def: altFirst(rule("block_expr"), rule("simple_expr")),
    },

    // block_expr: let, if, while, foreach, trycatch, with, fn
    block_expr: {
        def: alt(
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
    },
    strong_block: { def: alt(rule("do")) },
    let: {
        def: ssep(
            rule("blank"),
            kw("keyword", "let"),
            alt(rule("let_loop_block"), rule("let_block"), rule("simple_let")),
        ),
    },
    // add a blank node before to prevent the single rule wrapped from being elided
    simple_let: { def: seq(ignored(nothing()), rule("let_header")) },
    let_header: {
        def: bind(
            "guard",
            true,
            lookahead(false, kw("keyword", "in")),
            rule("let_bindings"),
        ),
    },
    let_bindings: {
        def: joined(
            ignored(
                seq(
                    opt(rule("blank_sameline")),
                    rule("comma"),
                    opt(rule("blank_sameline")),
                ),
            ),
            seq(
                ignored(ambient("guard", nothing())),
                lookahead(false, rule("strong_block")),
                rule("let_binding"),
            ),
            false,
            false,
        ),
    },
    let_binding: {
        def: rule(
            "binary_op",
            rule("name"),
            donate(rule("let_assign_op")),
            altFirst(
                rule("name"),
                // a destructuring pattern: any expression that cannot
                // start with a name.
                // One level up from assignment so it can't inadvertently
                // steal the = away from let.
                rule("ternary"),
            ),
            rule("expr"),
            nothing(),
        ),
    },
    let_assign_op: { def: alt(rule("normal_assign")) },
    let_block: {
        def: ssep(
            rule("blank"),
            rule("let_header"),
            seq(
                kw("keyword", "in"),
                // no sep here!
                rule("body_exprs", kw("keyword", "end"), yes()),
            ),
        ),
    },
    let_loop_block: {
        def: ssep(
            rule("blank"),
            op("punctuation", "("),
            rule("name"),
            op("punctuation", ")"),
            rule("let_block"),
        ),
    },
    if: {
        def: ssep(
            rule("blank"),
            kw("keyword", "if"),
            seq(
                bind(
                    "guard",
                    true,
                    lookahead(false, kw("keyword", "then")),
                    rule("expr"),
                ),
                ignored(opt(rule("blank"))),
                ignored(opt(kw("keyword", "then"))),
                altFirst(rule("if_else"), rule("if_no_else")),
            ),
        ),
    },
    if_else: {
        def: seq(
            rule("body_exprs", kw("keyword", "else", "end"), no()),
            ignored(rule("blank")),
            kw("keyword", "else"),
            rule("body_exprs", kw("keyword", "end"), yes()),
        ),
    },
    if_no_else: {
        def: seq(
            rule("body_exprs", kw("keyword", "else", "end"), no()),
            ignored(opt(seq(rule("blank"), kw("keyword", "end")))),
        ),
    },
    while: {
        def: ssep(
            rule("blank"),
            kw("keyword", "while"),
            seq(
                ignored(rule("blank")),
                rule("expr"),
                rule("body_exprs", kw("keyword", "end"), yes()),
            ),
        ),
    },
    for: {
        def: ssep(
            rule("blank"),
            kw("keyword", "for"),
            seq(
                ignored(rule("blank")),
                rule("assignment"),
                rule("body_exprs", kw("keyword", "end"), yes()),
            ),
        ),
    },
    trycatch: {
        def: ssep(
            rule("blank"),
            kw("keyword", "try"),
            seq(
                rule("trycatch_guarded"),
                cut(),
                rep(false, rule("trycatch_handler")),
                opt(rule("trycatch_else")),
                opt(rule("trycatch_finally")),
                ignored(opt(seq(rule("blank"), kw("keyword", "end")))),
            ),
        ),
    },
    trycatch_guarded: {
        def: rule(
            "body_exprs",
            kw("keyword", "catch", "finally", "else", "end"),
            no(),
        ),
    },
    trycatch_handler: {
        def: seq(
            ignored(rule("blank")),
            kw("keyword", "catch"),
            ignored(rule("blank")),
            bind(
                "guard",
                true,
                lookahead(
                    false,
                    kw("keyword", "catch", "finally", "else", "end"),
                ),
                rule("expr"),
            ),
            rule(
                "body_exprs",
                kw("keyword", "catch", "finally", "else", "end"),
                no(),
            ),
        ),
    },
    trycatch_else: {
        def: seq(
            ignored(rule("blank")),
            kw("keyword", "else"),
            rule("body_exprs", kw("keyword", "finally", "end"), no()),
        ),
    },
    trycatch_finally: {
        def: seq(
            ignored(rule("blank")),
            kw("keyword", "finally"),
            rule("body_exprs", kw("keyword", "end"), no()),
        ),
    },
    with: {
        def: ssep(
            rule("blank"),
            kw("keyword", "with"),
            seq(rule("expr"), rule("body_exprs", kw("keyword", "end"), yes())),
        ),
    },
    fn: {
        def: ssep(
            rule("blank"),
            kw("keyword", "fn"),
            op("punctuation", "("),
            cut(),
            rule("explicit_args"),
            seq(
                op("punctuation", ")"),
                rule("body_exprs", kw("keyword", "end"), yes()),
            ),
        ),
    },
    always: {
        def: ssep(
            rule("blank"),
            kw("keyword", "always"),
            seq(
                cut(),
                ignored(tag("keyword", lit("@"))),
                cut(),
                rule("par_exp"),
                rule("body_exprs", kw("keyword", "end"), yes()),
            ),
        ),
    },
    do: {
        def: ssep(
            rule("blank"),
            kw("keyword", "do", "begin"),
            rule("body_exprs", kw("keyword", "end"), yes()),
        ),
    },
    body_exprs: {
        params: ["end", "consume"],
        def: bind(
            "guard",
            true,
            lookahead(false, param("end")),
            seq(
                altFirst(
                    seq(
                        ignored(rule("blank_sameline")),
                        ignored(ambient("guard", nothing())),
                        rule("expr"),
                    ),
                    seq(rule("exprs")),
                ),
                ignored(
                    if_(
                        param("consume"),
                        opt(seq(rule("blank"), param("end"))),
                        nothing(),
                    ),
                ),
            ),
        ),
    },
    simple_expr: { def: rule("cascade", rule("pipe")) },
    binary_op: {
        params: ["nomatch", "op", "lhs", "rhs", "guard"],
        def: alt(
            adopt(
                ssep(
                    rule("blank"),
                    param("lhs"),
                    param("op"),
                    ignored(param("guard")),
                    cut(),
                    param("rhs"),
                ),
            ),
            param("nomatch"),
        ),
    },

    // chain-associative: [cascade, receiver, op, section, op, section, ...],
    // so an evaluator can walk the sections left to right instead of unwinding
    // right-nested binary nodes. within the sections, an assignment's
    // right side may not itself be a cascade (Dart's
    // expressionWithoutCascade) so a later .. link stays a section of
    // this cascade instead of being swallowed into the assigned value;
    // the fence bind therefore wraps each section. the receiver on the
    // left is outside the bind, so x = a..b still assigns the whole
    // cascade
    cascade: {
        params: ["operand"],
        def: alt(
            seq(
                param("operand"),
                seq(
                    ignored(opt(rule("blank"))),
                    rule("cascade_op"),
                    ignored(opt(rule("blank"))),
                    ignored(lookahead(true, rule("member"))),
                    cut(),
                    bind(
                        "assign_rhs",
                        false,
                        altFirst(rule("block_expr"), rule("pipe")),
                        param("operand"),
                    ),
                ),
                rep(
                    false,
                    seq(
                        ignored(opt(rule("blank"))),
                        rule("cascade_op"),
                        ignored(opt(rule("blank"))),
                        ignored(lookahead(true, rule("member"))),
                        cut(),
                        bind(
                            "assign_rhs",
                            false,
                            altFirst(rule("block_expr"), rule("pipe")),
                            param("operand"),
                        ),
                    ),
                ),
            ),
            param("operand"),
        ),
    },
    cascade_op: { def: alt(rule("up_dot_null"), rule("up_dot")) },
    up_dot: { def: op("operator", "..") },
    up_dot_null: {
        def: op("operator", "?.."),
    },

    // left associative
    pipe: {
        def: rule(
            "binary_op",
            rule("implicit_call"),
            donate(rule("pipe_op")),
            rule("pipe"),
            rule("implicit_call"),
            nothing(),
        ),
    },
    pipe_op: {
        def: alt(
            rule("normal_pipe"),
            rule("filter_pipe"),
            rule("map_pipe"),
            rule("reduce_pipe"),
        ),
    },
    normal_pipe: { def: op("operator", "|>") },
    filter_pipe: { def: op("operator", "|?>") },
    map_pipe: { def: op("operator", "|*>") },
    reduce_pipe: {
        def: seq(
            op("operator", "|+>"),
            cut(),
            op("punctuation", "["),
            bind("guard", false, nothing(), rule("exprs")),
            op("punctuation", "]"),
        ),
    },

    // the shared node types for both call forms -
    // implicit_call/implicit_args and explicit_call/explicit_args
    // delegate here so their CST nodes just say "call" and "args"
    call: {
        params: ["form"],
        def: param("form"),
    },
    args: {
        params: ["form"],
        def: param("form"),
    },

    // right associative
    // implicit call is speculative since it's implicit, so if the arguments can't be parsed for any reason, give up and try assign_rev
    implicit_call: {
        def: rule(
            "call",
            alt(
                ssep(
                    rule("blank_sameline"),
                    rule("assign_rev"),
                    try_(nonempty(rule("implicit_args"))),
                ),
                rule("assign_rev"),
            ),
        ),
    },
    implicit_args: {
        params: ["first", "rest"],
        def: rule(
            "args",
            seq(
                // can't use joined() here since the first and second are different + there are lookahead assertions!
                ignored(ambient("guard", nothing())),
                lookahead(false, rule("strong_block")),
                param(
                    "first",
                    altFirst(
                        rule("block_expr"),
                        rule("kw_arg"),
                        rule("splat_arg"),
                        rule("cascade", rule("implicit_call")),
                    ),
                ),
                rep(
                    false,
                    seq(
                        ignored(
                            seq(
                                opt(rule("blank_sameline")),
                                rule("comma"),
                                opt(rule("blank_sameline")),
                            ),
                        ),
                        lookahead(false, rule("strong_block")),
                        ignored(ambient("guard", nothing())),
                        param(
                            "rest",
                            altFirst(
                                rule("block_expr"),
                                rule("kw_arg"),
                                rule("splat_arg"),
                                rule("cascade", rule("implicit_call")),
                                rule("empty_arg"),
                            ),
                        ),
                    ),
                ),
            ),
        ),
    },
    empty_arg: {
        def: seq(nothing(), lookahead(true, rule("comma"))), // only between commas
    },

    // only valid as a direct argument to a call or collection
    kw_arg: {
        def: adopt(
            ssep(
                rule("blank"),
                alt(
                    rule("member"),
                    rule("quote_prefix"),
                    rule("member_prefix"),
                ),
                donate(rule("kw_arg_op")),
                rule("assign_rev"),
            ),
        ),
    },
    kw_arg_op: { def: alt(rule("kw")) },
    kw: {
        def: op("operator", ":"),
    },
    // only valid as a direct argument to a call or collection
    splat_arg: {
        def: adopt(
            ssep(
                rule("blank"),
                donate(alt(rule("splat"), rule("splat_kw"))),
                cut(),
                rule("factor"),
            ),
        ),
    },
    splat: { def: op("operator", "...") },
    splat_kw: { def: op("operator", "...:") },

    // left associative
    assign_rev: {
        def: rule(
            "binary_op",
            rule("assignment"),
            donate(rule("assign_rev_op")),
            rule("assign_rev"),
            rule("assignment"),
            nothing(),
        ),
    },
    assign_rev_op: { def: alt(rule("arrow")) },
    arrow: {
        def: op("operator", "->"),
    },

    // strongly right associative
    assignment: {
        def: rule(
            "binary_op",
            rule("ternary"),
            donate(rule("assign_op")),
            rule("ternary"),
            ambient("assign_rhs", rule("expr")),
            nothing(),
        ),
    },
    assign_op: {
        def: alt(
            rule("old_assign"),
            rule("logical_and_assign"),
            rule("logical_or_assign"),
            rule("bitwise_and_assign"),
            rule("bitwise_or_assign"),
            rule("bitwise_xor_assign"),
            rule("shift_left_assign"),
            rule("shift_right_assign"),
            rule("add_assign"),
            rule("sub_assign"),
            rule("mul_assign"),
            rule("div_assign"),
            rule("mod_assign"),
            rule("format_assign"),
            rule("pow_assign"),
            rule("normal_assign"),
        ),
    },
    old_assign: { def: op("operator", "<-") },
    normal_assign: { def: op("operator", "=") },
    // an augmented assignment is a base operator followed by =; each one
    // gets its own rule named after the whole operator (add_assign for +=)
    // so that binary_op's name adoption keeps which operation it is,
    // instead of adopting a bare aug_assign and dropping the base operator.
    // the base operator is ignored inside its own rule, since the rule's
    // name already says which operation it is
    logical_and_assign: {
        def: seq(ignored(rule("logical_and")), ignored(rule("normal_assign"))),
    },
    logical_or_assign: {
        def: seq(ignored(rule("logical_or")), ignored(rule("normal_assign"))),
    },
    bitwise_and_assign: {
        def: seq(ignored(rule("bitwise_and")), ignored(rule("normal_assign"))),
    },
    bitwise_or_assign: {
        def: seq(ignored(rule("bitwise_or")), ignored(rule("normal_assign"))),
    },
    bitwise_xor_assign: {
        def: seq(ignored(rule("bitwise_xor")), ignored(rule("normal_assign"))),
    },
    shift_left_assign: {
        def: seq(ignored(rule("shift_left")), ignored(rule("normal_assign"))),
    },
    shift_right_assign: {
        def: seq(ignored(rule("shift_right")), ignored(rule("normal_assign"))),
    },
    add_assign: {
        def: seq(ignored(rule("add")), ignored(rule("normal_assign"))),
    },
    sub_assign: {
        def: seq(ignored(rule("sub")), ignored(rule("normal_assign"))),
    },
    mul_assign: {
        def: seq(ignored(rule("mul")), ignored(rule("normal_assign"))),
    },
    div_assign: {
        def: seq(ignored(rule("div")), ignored(rule("normal_assign"))),
    },
    mod_assign: {
        def: seq(ignored(rule("mod")), ignored(rule("normal_assign"))),
    },
    format_assign: {
        def: seq(ignored(rule("format")), ignored(rule("normal_assign"))),
    },
    pow_assign: {
        def: seq(ignored(rule("pow")), ignored(rule("normal_assign"))),
    },

    // right associative
    ternary: {
        def: alt(
            ssep(
                rule("blank"),
                rule("logical"),
                op("operator", "?"),
                cut(),
                rule("assignment"),
                cut(),
                op("operator", ":"),
                rule("ternary"),
            ),
            rule("logical"),
        ),
    },

    // left associative
    logical: {
        def: rule(
            "binary_op",
            rule("comparison"),
            donate(rule("logical_op")),
            rule("logical"),
            rule("comparison"),
            lookahead(false, rule("assign_op")),
        ),
    },
    logical_op: { def: alt(rule("logical_and"), rule("logical_or")) },
    logical_and: { def: alt(op("operator", "&&"), kw("operator", "and")) },
    logical_or: {
        def: alt(op("operator", "||"), kw("operator", "or")),
    },

    // chain associative
    comparison: {
        def: alt(
            joined(
                seq(
                    ignored(opt(rule("blank"))),
                    rule("comparison_op"),
                    ignored(opt(rule("blank"))),
                ),
                rule("predicate"),
                true,
                false,
            ),
            rule("predicate"),
        ),
    },
    comparison_op: {
        def: alt(
            rule("equal"),
            rule("not_equal"),
            rule("lte"),
            rule("gte"),
            rule("less"),
            rule("greater"),
        ),
    },
    equal: { def: op("operator", "==") },
    not_equal: { def: op("operator", "!=") },
    lte: { def: op("operator", "<=") },
    gte: { def: op("operator", ">=") },
    less: { def: op("operator", "<") },
    greater: {
        def: op("operator", ">"),
    },

    // left associative: x is P is a flipped call, P(x) -- the right
    // side is just a postfix, so the predicate is a callable chain and
    // nothing else can be swallowed into it
    predicate: {
        def: rule(
            "binary_op",
            rule("containment"),
            donate(rule("predicate_op")),
            rule("predicate"),
            rule("postfix"),
            lookahead(false, rule("assign_op")),
        ),
    },
    predicate_op: {
        def: alt(rule("normal_predicate"), rule("inverted_predicate")),
    },
    normal_predicate: { def: kw("operator", "is") },
    inverted_predicate: {
        def: ignored(
            ssep(rule("blank"), kw("operator", "is"), kw("operator", "not")),
        ),
    },

    // non associative
    containment: {
        def: rule(
            "binary_op",
            rule("bitwise"),
            donate(rule("containment_op")),
            rule("bitwise"),
            rule("bitwise"),
            nothing(),
        ),
    },
    containment_op: {
        def: alt(rule("needle_in_haystack"), rule("haystack_has_needle")),
    },
    needle_in_haystack: {
        def: alt(
            op("operator", "<:"),
            seq(ignored(ambient("guard", nothing())), kw("operator", "in")),
        ),
    },
    haystack_has_needle: {
        def: alt(op("operator", ":>"), kw("operator", "has")),
    },

    // left associative
    bitwise: {
        def: rule(
            "binary_op",
            rule("bitshift"),
            donate(rule("bitwise_op")),
            rule("bitwise"),
            rule("bitshift"),
            lookahead(false, rule("assign_op")),
        ),
    },
    bitwise_op: {
        def: alt(rule("bitwise_and"), rule("bitwise_or"), rule("bitwise_xor")),
    },
    bitwise_and: { def: op("operator", "&") },
    bitwise_or: { def: op("operator", "|") },
    bitwise_xor: {
        def: op("operator", "^"),
    },

    // left associative
    bitshift: {
        def: rule(
            "binary_op",
            rule("sum"),
            donate(rule("bitshift_op")),
            rule("bitshift"),
            rule("sum"),
            lookahead(false, rule("assign_op")),
        ),
    },
    bitshift_op: { def: alt(rule("shift_left"), rule("shift_right")) },
    shift_left: { def: op("operator", "<<") },
    shift_right: {
        def: op("operator", ">>"),
    },

    // left associative
    sum: {
        def: rule(
            "binary_op",
            rule("term"),
            donate(rule("sum_op")),
            rule("sum"),
            rule("term"),
            lookahead(false, rule("assign_op")),
        ),
    },
    sum_op: { def: alt(rule("add"), rule("sub")) },
    add: { def: op("operator", "+") },
    sub: {
        def: op("operator", "-"),
    },

    // left associative
    term: {
        def: rule(
            "binary_op",
            rule("factor"),
            donate(rule("term_op")),
            rule("term"),
            rule("factor"),
            lookahead(false, rule("assign_op")),
        ),
    },
    term_op: {
        def: alt(rule("mul"), rule("div"), rule("mod"), rule("format")),
    },
    mul: { def: op("operator", "*") },
    div: { def: op("operator", "/") },
    mod: {
        def: op("operator", "%"),
    },
    format: { def: op("operator", "%%") },

    // right associative
    factor: {
        def: rule(
            "binary_op",
            rule("postfix"),
            donate(rule("factor_op")),
            rule("postfix"),
            rule("factor"),
            lookahead(false, rule("assign_op")),
        ),
    },
    factor_op: { def: alt(rule("pow")) },
    pow: {
        def: op("operator", "**"),
    },

    // postfix: a call binds to a whole indexing chain, so calls and
    // indexing are one left-associative level entered through here
    postfix: { def: altFirst(rule("explicit_call"), rule("indexing")) },
    explicit_call: {
        def: rule(
            "call",
            ssep(
                rule("blank"),
                rule("postfix"),
                op("punctuation", "("),
                cut(),
                rule("explicit_args"),
                op("punctuation", ")"),
            ),
        ),
    },
    explicit_args: {
        def: rule(
            "args",
            alt(
                bind(
                    "guard",
                    false,
                    nothing(),
                    joined(
                        ignored(rule("ws_comma")),
                        altFirst(
                            rule("kw_arg"),
                            rule("splat_arg"),
                            rule("expr"),
                            rule("empty_arg"),
                        ),
                        false,
                        true,
                    ),
                ),
                seq(), // empty args
            ),
        ),
    },

    // chain-associative: a whole run of indexing is one flat node,
    // [indexing, base, op, member, op, member, ...], so an evaluator can
    // walk the links left to right (with ?. short-circuiting) instead of
    // unwinding left-nested binary nodes. the base is a whole postfix, so
    // a call in the middle (a.b(1).c) interrupts the chain: the call's
    // callee is the chain so far, and the remaining links form a new
    // chain based on that call. with no link at all, indexing is just a
    // primary
    indexing: {
        def: alt(
            seq(
                rule("postfix"),
                seq(
                    ignored(opt(rule("blank"))),
                    rule("indexing_op"),
                    ignored(opt(rule("blank"))),
                    cut(),
                    rule("member"),
                ),
                rep(
                    false,
                    seq(
                        ignored(opt(rule("blank"))),
                        rule("indexing_op"),
                        ignored(opt(rule("blank"))),
                        cut(),
                        rule("member"),
                    ),
                ),
            ),
            rule("primary"),
        ),
    },
    indexing_op: { def: alt(rule("dot"), rule("null_dot")) },
    dot: { def: op("operator", ".") },
    null_dot: {
        def: op("operator", "?."),
    },

    // what may follow a dot: a static key, an index, or a computed key
    member: {
        def: alt(rule("name"), rule("number"), rule("par_exp")),
    },

    // primary: unary operators or atom
    primary: {
        def: alt(rule("unary"), rule("atom")),
    },

    // these are all prefix unary
    unary: { def: alt(rule("member_prefix"), rule("func_prefix")) },
    func_prefix: {
        def: adopt(
            ssep(
                rule("blank"),
                donate(rule("func_prefix_op")),
                cut(),
                rule("factor"),
            ),
        ),
    },
    member_prefix: {
        def: adopt(
            ssep(
                rule("blank"),
                donate(rule("member_prefix_op")),
                cut(),
                rule("member"),
            ),
        ),
    },
    quote_prefix: {
        def: adopt(
            ssep(rule("blank"), donate(rule("quote")), cut(), rule("member")),
        ),
    },
    func_prefix_op: {
        def: alt(
            rule("length"),
            rule("rich_collection"),
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
    },
    length: { def: op("operator", "#") },
    rich_collection: { def: op("operator", "%") },
    negate: { def: op("operator", "-") },
    abs: { def: op("operator", "+") },
    not: { def: op("operator", "!") },
    bit_not: { def: op("operator", "~") },
    quote: { def: op("operator", "`") },
    unquote: { def: op("operator", "$") },
    unquote_splicing: { def: op("operator", "$.") },
    special: { def: op("operator", "@") },
    lazy: { def: op("operator", "^") },
    ref: { def: op("operator", "&") },
    deref: { def: op("operator", "*") },
    member_prefix_op: {
        def: alt(rule("sym"), rule("unique_sym"), rule("option")),
    },
    sym: { def: op("operator", ":") },
    unique_sym: { def: op("operator", "::") },
    option: {
        def: seq(op("operator", "."), lookahead(false, rule("number"))), // check to fix ".5" from parsing as an option
    },

    // atoms: number, string, regex, boolean, null, collection literal, quasiquote, parenthesized expression, name
    atom: {
        def: alt(
            rule("number"),
            rule("string"),
            rule("regex"),
            rule("boolean"),
            rule("collection"),
            rule("quasiquote"),
            rule("par_exp"),
            rule("name"),
            rule("strong_block"),
        ),
    },
    number: { def: tag("number", alt(rule("hex"), rule("bin"), rule("dec"))) },
    hex: { def: seq(ignored(lit("0x")), cut(), regex(/[a-f0-9]+/i)) },
    bin: { def: seq(ignored(lit("0b")), cut(), regex(/[01]+/i)) },
    dec: { def: regex(/((?!0\d)\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?/i) },
    string: { def: alt(rule("r_string"), rule("i_string")) },
    r_string: {
        def: seq(
            ignored(tag("string", lit("'"))),
            cut(),
            rep(false, rule("r_part")),
            ignored(tag("string", lit("'"))),
        ),
    },
    r_part: { def: alt(rule("r_escape"), rule("r_body")) },
    r_escape: { def: tag("escape", regex(/\\./)) },
    r_body: { def: tag("string", regex(/[^'\\]+/)) },
    i_string: {
        def: seq(
            ignored(tag("string", lit('"'))),
            cut(),
            rep(
                false,
                alt(
                    tag(
                        "escape",
                        seq(
                            ignored(regex(/\\(?!\()/)),
                            cut(),
                            rule("i_escape"),
                        ),
                    ),
                    rule("i_interpolation"),
                    rule("i_body"),
                ),
            ),
            ignored(tag("string", lit('"'))),
        ),
    },
    i_escape: {
        def: alt(
            rule("i_known_escape"),
            rule("i_x_escape"),
            rule("i_u_escape"),
            rule("i_U_escape"),
        ),
    },
    i_known_escape: { def: regex(/./) },
    i_x_escape: { def: seq(ignored(lit("x")), cut(), regex(/[0-9a-f]{2}/)) },
    i_u_escape: { def: seq(ignored(lit("u")), cut(), regex(/[0-9a-f]{4}/)) },
    i_U_escape: {
        def: seq(
            ignored(lit("U")),
            cut(),
            ignored(lit("{")),
            regex(/[0-9a-f]+/),
            ignored(lit("}")),
        ),
    },
    i_interpolation: {
        def: seq(
            ignored(tag("escape", lit("\\("))),
            cut(),
            bind("guard", false, nothing(), rule("exprs")),
            ignored(tag("escape", lit(")"))),
        ),
    },
    i_body: { def: tag("string", regex(/[^"\\]+/)) },
    regex: {
        def: tag(
            "regex",
            seq(
                ignored(lit("/")),
                regex(/(\[([^\]]|\\\])+\]|\\.|[^\\/\n])*/),
                ignored(lit("/")),
                regex(/[gimsuvy]*/), // cSpell: ignore gimsuvy
            ),
        ),
    },
    boolean: {
        def: seq(
            ignored(nothing()),
            alt(rule("boolean_true"), rule("boolean_false")),
        ),
    },
    boolean_true: { def: kw("boolean", "true", "True", "TRUE") },
    boolean_false: { def: kw("boolean", "false", "False", "FALSE") },
    collection: {
        def: ssep(
            rule("blank"),
            op("punctuation", "["),
            cut(),
            bind(
                "guard",
                false,
                nothing(),
                alt(
                    rule("empty_collection"),
                    joined(
                        ignored(rule("ws_comma")),
                        rule("collection_item"),
                        false,
                        true,
                    ),
                ),
            ),
            op("punctuation", "]"),
        ),
    },
    ws_comma: { def: seq(rule("blank"), rule("comma"), rule("blank")) },
    empty_collection: { def: alt(rule("empty_list"), rule("empty_map")) },
    empty_list: { def: ignored(nothing()) },
    empty_map: { def: op("operator", ":") },
    collection_item: {
        def: altFirst(
            rule("kw_arg"),
            rule("collection_shorthand"),
            rule("splat_arg"),
            rule("expr"),
        ),
    },
    collection_shorthand: {
        def: ssep(
            rule("blank"),
            ignored(rule("quote")),
            alt(rule("atom"), rule("par_exp")),
            op("operator", ":"),
        ),
    },
    quasiquote: {
        def: tag(
            "quoted",
            ssep(
                rule("blank"),
                op("punctuation", "{"),
                cut(),
                bind("guard", false, nothing(), rule("exprs")),
                op("punctuation", "}"),
            ),
        ),
    },
    par_exp: {
        def: ssep(
            rule("blank"),
            op("punctuation", "("),
            cut(),
            bind("guard", false, nothing(), rule("exprs")),
            op("punctuation", ")"),
        ),
    },
    name: {
        def: tag("name", regex(/[_\p{L}][_\p{L}\p{N}]*/u)),
    },
});

/**
 * Every highlight tag name used anywhere in {@link backolonGrammar}, collected
 * by walking all of its combinator trees (e.g. for building a syntax-highlight
 * theme).
 */
export const all_tags = new Set(
    objectValues(backolonGrammar)
        .map((x) => x.def)
        .reduce(
            (prev, x) => [
                ...prev,
                ...walkCombinator<
                    string[],
                    void,
                    keyof typeof backolonGrammar,
                    any
                >(x, undefined, {
                    leaf: (node) =>
                        opDefs[node.op].hashFields
                            .flatMap((f) =>
                                f[1] === MixAction.Tag ? [f[0]] : [],
                            )
                            .map((f) => (node as any)[f]),
                    fold: (fields) => fields.flatMap((x) => x[2]),
                }),
            ],
            [] as string[],
        ),
);
// console.log({ all_tags });
// Object.entries(backolonGrammar).forEach(([rule, g]) => {
//     console.log(`${rule}: ${describeCombinator(Array.isArray(g) ? g[1] : g)}`);
// });
