import { alt, ambient, bind, cut, die, Grammar, GrammarCombinator, if_, ignored, joined, kw, lit, lookahead, no, nonempty, nothing, opt, param, regex, rep, rule, sameline, seq, ssep, tag, try_ } from "./combinator";
import { CSTNode } from "./cst";
import { metaGrammar } from "./metagrammar";
import { parseToCST } from "./parseToCST";

/**
 * Compiling the metagrammar: parse grammar text with
 * {@link metaGrammar} and lower the CST back into combinator data.
 * This is the reverse of `describeCombinator` for the forms describe
 * renders (a describe -> parse -> compile -> describe round trip is
 * a fixed point), and it is also how a grammar can be written as
 * text in the first place:
 *
 *     const grammar = Object.fromEntries(
 *         ["foo: bar baz", "baz(x): abc $x"].map(s => compileRule(parseRule(s))));
 */

// ---------------------------------------------------------------------------
// Parsing

const parseFully = (text: string, entry: string): CSTNode => {
    const cst = parseToCST(text, 0, entry, metaGrammar, entry);
    if (cst.errorExpected || cst.end !== text.length) throw new Error("could not parse " + entry + " from " + JSON.stringify(text));
    return cst;
};

/** Parse one rule definition (`name: body`) into a CST. */
export const parseRule = (text: string): CSTNode => parseFully(text, "rule_definition");

/** Parse a whole grammar text (rule definitions separated by blanks) into a CST. */
export const parseGrammar = (text: string): CSTNode => parseFully(text, "grammar");

/** Parse one combinator description (a rule body) into a CST. */
export const parseCombinator = (text: string): CSTNode => parseFully(text, "combinator");

// ---------------------------------------------------------------------------
// CST access

/** The meaningful children of a node: not ignored, and not the empty node an absent opt leaves behind. */
const kids = (node: CSTNode): CSTNode[] => (node.children ?? []).filter(c => !c.ignored && (c.type !== undefined || c.children?.length || c.text));

/**
 * A node's meaningful descendants with anonymous wrappers spliced
 * out: a seq body creates an untyped node between a rule node and
 * its items, so typed subtrees and text leaves are collected through
 * those wrappers (the same flattening a CST-to-AST walk does).
 */
const flatten = (node: CSTNode): CSTNode[] => kids(node).flatMap(c => c.type !== undefined || !c.children?.length ? [c] : flatten(c));

/** The string leaves among a node's flattened children, in order. */
const strings = (node: CSTNode): string[] => flatten(node).filter(c => c.type === undefined).map(c => c.text ?? "");

/** The typed subtrees among a node's flattened children, in order. */
const subtrees = (node: CSTNode): CSTNode[] => flatten(node).filter(c => c.type !== undefined);

/** The full source text a node spans: concatenating every leaf under it reproduces that part of the input. */
const spanText = (node: CSTNode): string => node.children?.length ? node.children.map(spanText).join("") : node.text ?? "";

const find = (node: CSTNode, type: string): CSTNode | undefined => subtrees(node).find(c => c.type === type);

/** Find a descendant through single-child delegation chains (combinator -> alternatives -> alt_options). */
const descend = (node: CSTNode, type: string): CSTNode | undefined => {
    if (node.type === type) return node;
    const only = subtrees(node);
    return only.length === 1 ? descend(only[0]!, type) : undefined;
};

// ---------------------------------------------------------------------------
// Lowering

const compileSequence = (node: CSTNode, grouped: boolean): GrammarCombinator => {
    const items = subtrees(node).map(compilePostfixed);
    if (items.length === 1) return grouped ? seq(items[0]!) : items[0]!;
    return seq(...items);
};

/** Compile an alternatives-level node: a whole body, or a parenthesized group when `grouped` is set. */
const compileAlternatives = (node: CSTNode, grouped: boolean): GrammarCombinator => {
    const options = descend(node, "alt_options") ?? node;
    const sequences = subtrees(options).filter(c => c.type === "sequence");
    if (sequences.length === 0) return nothing();
    if (sequences.length === 1) return compileSequence(sequences[0]!, grouped);
    return alt(...sequences.map(s => compileSequence(s, false)));
};

/** Compile a primary with its postfixes, applied left to right. A node that is not a postfixed chain is a primary on its own. */
const compilePostfixed = (node: CSTNode): GrammarCombinator => {
    if (node.type !== "postfixed" && node.type !== "joined_element") return compilePrimary(node);
    const [base, ...posts] = subtrees(node);
    let acc = compilePostfixed(base!);
    for (const post of posts) {
        if (post.type === "opt_post") acc = opt(acc);
        else if (post.type === "repeat_post") acc = rep(spanText(post) === "+", acc);
        else if (post.type === "star_post") acc = rep(false, acc);
        else if (post.type === "ssep_post") {
            const items = find(post, "items");
            acc = ssep(acc, ...(items ? subtrees(items).map(compilePostfixed) : []));
        } else if (post.type === "joined_post") {
            const element = find(post, "joined_element") ?? subtrees(post)[0];
            acc = joined(acc, compilePostfixed(element!), false, true);
        }
    }
    return acc;
};

const compilePrimary = (node: CSTNode): GrammarCombinator => {
    switch (node.type) {
        case "paren": return compileAlternatives(find(node, "alternatives")!, true);
        case "empty_alt_form": return no();
        case "try_form": return try_(compileAlternatives(find(node, "alternatives")!, false));
        case "if_form": {
            const [condition, ifTrue, ifFalse] = subtrees(node).map(compilePostfixed);
            return if_(condition!, ifTrue!, ifFalse!);
        }
        case "lookahead_pos": return lookahead(true, compilePostfixed(subtrees(node)[0]!));
        case "lookahead_neg": return lookahead(false, compilePostfixed(subtrees(node)[0]!));
        case "sameline_form": return sameline(compilePostfixed(subtrees(node)[0]!));
        case "nonempty_form": return nonempty(compilePostfixed(subtrees(node)[0]!));
        case "keyword_form": {
            const tag = spanText(find(node, "name")!).trim();
            const options = subtrees(find(node, "kw_options")!).map(o => spanText(o).trim());
            return kw(tag, ...options);
        }
        case "bind_form": {
            const extend = strings(node)[0] === "&+";
            const name = spanText(find(node, "name")!).trim();
            const [value, body] = subtrees(node).filter(c => c.type !== "name").map(compilePostfixed);
            return bind(name, extend, value!, body!);
        }
        case "tag_form": return tag(spanText(find(node, "tag_name")!).trim(), compilePostfixed(subtrees(node).find(c => c.type !== "tag_name")!));
        case "ignored_form": return ignored(compilePostfixed(subtrees(node)[0]!));
        case "literal": return compilePrimary(subtrees(node)[0]!);
        case "string_literal": return lit(JSON.parse(spanText(node)));
        case "regex_literal": {
            const text = spanText(node);
            const slash = text.lastIndexOf("/");
            return regex(new RegExp(text.slice(1, slash), text.slice(slash + 1)));
        }
        case "rule_ref": {
            const name = spanText(find(node, "name")!).trim();
            const argList = find(node, "arg_list");
            const args = argList ? subtrees(argList).map(compilePostfixed) : [];
            return rule(name, ...args);
        }
        case "param_ref":
        case "ambient_ref": {
            const name = spanText(find(node, "name")!).trim();
            const fallback = subtrees(node).find(c => c.type !== "name");
            const make = node.type === "param_ref" ? param : ambient;
            return fallback ? make(name, compilePostfixed(fallback)) : make(name);
        }
        case "cut_form": {
            const number = find(node, "number");
            return cut(number ? parseInt(spanText(number)) : 1);
        }
        case "nothing_form": return nothing();
        case "die_form": return die(JSON.parse(spanText(find(node, "string_literal")!)));
        default: {
            // A level that delegated to a single form (e.g. a
            // postfixed with no postfixes surfacing as its primary).
            const only = subtrees(node);
            if (only.length === 1) return compilePostfixed(only[0]!);
            throw new Error("cannot compile a " + node.type + " node");
        }
    }
};

/** Compile a combinator CST (from {@link parseCombinator}) into a combinator. */
export const compileCombinator = (cst: CSTNode): GrammarCombinator => compileAlternatives(cst, false);

/** Compile a rule-definition CST (from {@link parseRule}) into a grammar entry: `[name, body]`, or `[name, [params, body]]` for a parameterized rule. */
export const compileRule = (cst: CSTNode): [string, GrammarCombinator | [string[], GrammarCombinator]] => {
    const name = spanText(find(cst, "name")!).trim();
    const paramList = find(cst, "param_list");
    const body = compileAlternatives(find(cst, "alternatives")!, false);
    return paramList
        ? [name, [subtrees(paramList).map(p => spanText(p).trim()), body]]
        : [name, body];
};

/** Compile a whole-grammar CST (from {@link parseGrammar}) into a grammar. */
export const compileGrammar = (cst: CSTNode): Grammar => Object.fromEntries(subtrees(cst).filter(c => c.type === "rule_definition").map(compileRule));

/** Build a grammar from rule strings: `buildGrammar("foo: bar baz", "baz(x): abc $x")`. */
export const buildGrammar = (...rules: string[]): Grammar => Object.fromEntries(rules.map(s => compileRule(parseRule(s))));

/** Build a grammar from one long text of rule definitions separated by blanks. */
export const grammarFromText = (text: string): Grammar => compileGrammar(parseGrammar(text));
