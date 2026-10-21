import { javaHash } from "@r47onfire/game-math";
import { imul } from "lib0/math";
import { MixAction, opDefs } from "./ops";

/** A grammar: rule names mapped to their definitions. */
export type Grammar = Readonly<Record<string, GrammarCombinator | ParameterizedRule>>;

/**
 * A parameterized rule definition: the parameter names, and the rule body.
 * Inside the body, `param(name)` evaluates the combinator that was passed
 * for that parameter at the call site (in the call site's scope).
 */
export type ParameterizedRule = readonly [params: readonly string[], body: GrammarCombinator];

/**
 * The operation a {@link GrammarCombinator} performs; determines which of
 * the per-operation subtypes a node is, and so which named fields it has.
 */
export type GrammarOp =
    /** consume a token of that type; produces a leaf */
    | "tok"
    /** consume a text keyword between regex \b separators */
    | "kw"
    /** node is trivial / no useful value */
    | "ign"
    /** call the rule and return a node with the results */
    | "rule"
    /** evaluate the combinator passed for the named rule parameter, in the scope of the call site that supplied it */
    | "param"
    /** evaluate the combinator bound to the named dynamic (ambient) parameter by the nearest enclosing bind, in the scope of that bind */
    | "ambient"
    /** bind a dynamic (ambient) parameter for the dynamic extent of a body */
    | "bind"
    /** return all results in an array */
    | "seq"
    /** sequencing, but with optional sep surrounding them; sep is ignored */
    | "ssep"
    /** repeat node separated by sep; sep is ignored */
    | "joined"
    /** return the longest match out of the alternatives (first if there's multiple of the same length) */
    | "alt"
    /** return the parse result or blank */
    | "opt"
    /** return an array of the results; loops the sequence */
    | "rep"
    /** conditional: match condition as a lookahead; if it matches, match if_true; else match if_false */
    | "if"
    /** tags the node */
    | "tag"
    /** cut */
    | "cut"
    /** lookahead positive or negative */
    | "lookahead"
    /** assert that we made progress */
    | "nonempty"
    /** assert that the contents are all on the same line */
    | "sameline"
    /** empty match */
    | "eps"
    /** instantly fails */
    | "die"
    /** speculative parse: any inner failure is downgraded to an ordinary failure, so enclosing alternatives can fall back */
    | "try"
    ;

/** Every subtype carries a lazily filled cache of its structural hash (see {@link hashCombinator}). */
interface CombinatorBase {
    /** cached structural hash; filled in by {@link hashCombinator} */
    hash?: number;
}

/** A literal string, or a regex as `[source, flags]` (the engine adds the sticky flag). */
export type TokCombinator = CombinatorBase & { readonly op: "tok", readonly pattern: string | [string, string] };
/** One of a list of keyword strings, matched between `\b` separators; the result is tagged and ignored. */
export type KwCombinator = CombinatorBase & { readonly op: "kw", readonly tag: string, readonly options: readonly string[] };
/** Parses `child`, flagging the result `ignored`. */
export type IgnCombinator = CombinatorBase & { readonly op: "ign", readonly child: GrammarCombinator };
/** Invokes the named rule; `args`, if present, are the arguments for a parameterized rule. */
export type RuleCombinator = CombinatorBase & { readonly op: "rule", readonly name: string, readonly args?: readonly GrammarCombinator[] };
/** Reads the lexical rule parameter `name`; evaluates `default` (at the reference site) if it is unbound. */
export type ParamCombinator = CombinatorBase & { readonly op: "param", readonly name: string, readonly default?: GrammarCombinator };
/** Reads the dynamic parameter `name`; evaluates `default` (at the reference site) if no enclosing bind bound it. */
export type AmbientCombinator = CombinatorBase & { readonly op: "ambient", readonly name: string, readonly default?: GrammarCombinator };
/** Parses `body` with the dynamic parameter `name` bound to `value` for body's dynamic extent. */
export type BindCombinator = CombinatorBase & { readonly op: "bind", readonly name: string, readonly value: GrammarCombinator, readonly body: GrammarCombinator };
/** Matches all of `items` in order. */
export type SeqCombinator = CombinatorBase & { readonly op: "seq", readonly items: readonly GrammarCombinator[] };
/** Matches all of `items` in order, with `separator` attempted before, between, and after them. */
export type SsepCombinator = CombinatorBase & { readonly op: "ssep", readonly items: readonly GrammarCombinator[], readonly separator: GrammarCombinator };
/** Matches `element` separated by `joiner`; `require2` demands at least two elements, `trailing` permits a trailing joiner. */
export type JoinedCombinator = CombinatorBase & { readonly op: "joined", readonly element: GrammarCombinator, readonly joiner: GrammarCombinator, readonly require2: boolean, readonly trailing: boolean };
/** Tries every one of `options`; the first that cut wins, else the longest match. */
export type AltCombinator = CombinatorBase & { readonly op: "alt", readonly options: readonly GrammarCombinator[] };
/** Matches `child` if it succeeds, else succeeds empty (unless it failed after a cut). */
export type OptCombinator = CombinatorBase & { readonly op: "opt", readonly child: GrammarCombinator };
/** Repeats `items` (cycling through them) greedily; `required` demands at least one match. */
export type RepCombinator = CombinatorBase & { readonly op: "rep", readonly items: readonly GrammarCombinator[], readonly required: boolean };
/** Evaluates `condition` as a lookahead; matches `if_true` if it matched, `if_false` otherwise. */
export type IfCombinator = CombinatorBase & { readonly op: "if", readonly condition: GrammarCombinator, readonly if_true: GrammarCombinator, readonly if_false: GrammarCombinator };
/** Parses `child` and tags the result with `tag`. */
export type TagCombinator = CombinatorBase & { readonly op: "tag", readonly tag: string, readonly child: GrammarCombinator };
/** Commits the enclosing choice points: a later failure no longer falls back, across `depth` levels. */
export type CutCombinator = CombinatorBase & { readonly op: "cut", readonly depth: number };
/** Asserts that `child` matches (`positive`) or does not match, consuming no input. */
export type LookaheadCombinator = CombinatorBase & { readonly op: "lookahead", readonly positive: boolean, readonly child: GrammarCombinator };
/** Parses `child` and fails if it consumed no input. */
export type NonemptyCombinator = CombinatorBase & { readonly op: "nonempty", readonly child: GrammarCombinator };
/** Parses `child` and fails if its span contains a newline. */
export type SamelineCombinator = CombinatorBase & { readonly op: "sameline", readonly child: GrammarCombinator };
/** Always matches, consuming no input. */
export type EpsCombinator = CombinatorBase & { readonly op: "eps" };
/** Always fails, with `message` naming what was expected; the failure carries an infinite cut. */
export type DieCombinator = CombinatorBase & { readonly op: "die", readonly message: string };
/** Parses `child` speculatively: any cut inside a failure is hidden, so enclosing alternatives can fall back. */
export type TryCombinator = CombinatorBase & { readonly op: "try", readonly child: GrammarCombinator };

/**
 * A single grammar node. Combinators are plain serializable data (no
 * functions), so grammars can be built, inspected, and patched as values.
 * Each operation has its own subtype with explicitly named fields; the
 * per-operation definitions (how a node is created, parsed, and hashed)
 * live together in the `opDefs` table in `ops.ts`.
 */
export type GrammarCombinator =
    | TokCombinator | KwCombinator | IgnCombinator | RuleCombinator
    | ParamCombinator | AmbientCombinator | BindCombinator
    | SeqCombinator | SsepCombinator | JoinedCombinator | AltCombinator
    | OptCombinator | RepCombinator | IfCombinator | TagCombinator
    | CutCombinator | LookaheadCombinator | NonemptyCombinator
    | SamelineCombinator | EpsCombinator | DieCombinator | TryCombinator;

/**
 * Resolves a reference node (`param`, `ambient`, or `bind`) to the hash of
 * what it refers to, for {@link hashCombinator}. `hashChild` hashes a node
 * with the same resolver in effect. Returning `undefined` means "not a
 * reference I resolve": the node is hashed structurally instead.
 */
export type ReferenceResolver = (node: GrammarCombinator, hashChild: (child: GrammarCombinator) => number) => number | undefined;

/**
 * A hash of a combinator tree, driven by the `hashFields` of each
 * operation's definition: like trees hash alike. Without a resolver this is
 * a purely structural hash and is cached on the node itself, so hashing a
 * tree costs one walk, ever. With a resolver (used by the parser to tell
 * parameterized rule instances apart), reference nodes contribute the hash
 * of what they resolve to in the current scopes instead of their own shape,
 * and nothing is cached -- the result depends on the scopes, not just the
 * tree.
 */
export const hashCombinator = (g: GrammarCombinator, resolve?: ReferenceResolver): number => {
    if (!resolve && g.hash !== undefined) return g.hash;
    if (resolve) {
        const resolved = resolve(g, child => hashCombinator(child, resolve));
        if (resolved !== undefined) return resolved;
    }
    var h = javaHash(g.op);
    const mix = (x: number, prime: number) => { h = (imul(h, prime) + x) >>> 0; };
    for (const [field, action] of opDefs[g.op].hashFields) {
        const value = (g as any)[field] as unknown;
        if (value === undefined) continue;
        switch (action) {
            case MixAction.String: mix(javaHash(value as string), 31); break;
            case MixAction.Number: mix(value as number, 31); break;
            case MixAction.Boolean: mix(value ? 1 : 0, 31); break;
            case MixAction.Text:
                if (typeof value === "string") mix(javaHash(value), 31);
                else for (const s of value as readonly string[]) mix(javaHash(s), 31);
                break;
            case MixAction.StringArray: for (const s of value as readonly string[]) mix(javaHash(s), 31); break;
            case MixAction.Child: mix(hashCombinator(value as GrammarCombinator, resolve), 31); break;
            case MixAction.Children: for (const child of value as readonly GrammarCombinator[]) mix(hashCombinator(child, resolve), 31); break;
            case MixAction.AuxChild: mix(hashCombinator(value as GrammarCombinator, resolve), 37); break;
        }
    }
    if (!resolve) g.hash = h;
    return h;
};

// The combinator factory functions; each is the `create` of its
// operation's definition in the op table (see ops.ts).
export {
    lit, regex, kw, ignored, rule, param, ambient, bind,
    seq, ssep, joined, alt, opt, rep, if_, tag, cut, lookahead,
    nonempty, sameline, eps, die, try_,
} from "./ops";
