import { last } from "lib0/array";
import { LocationTrace, RuntimeError, UNKNOWN_LOCATION } from "../errors";
import { boxOperatorSymbol, Thing, ThingType, typecheck } from "../objects/thing";
import { unparse } from "../parser/unparse";
import { PatternType } from "./internals";
import { matchPattern } from "./match";

export const pattern = (type: PatternType, gsv: number | boolean, loc = UNKNOWN_LOCATION, children: readonly Thing[] = [], start = "", end = "", join = "") => new Thing(ThingType.pattern, children, { t: type, gsv }, start, end, join, loc);

/*

pattern syntax:

<space> --> ZERO OR MORE spaces (space is optional but permitted)
<two spaces> --> ONE or more spaces (space is required)
<newline> --> newline literal
x --> wildcard capture of any element named x
x ... --> repeat x (lazy)
x ... [+] --> repeat x (greedy) where [+] is a square bracket containing +
(x) --> grouping (parenthesised pattern)
{x|y} --> alternation (either x or y)
[x (stuff)] --> capture name with subpattern
[x: roundblock] --> type match & capture
[=xyz] --> literal match (can be symbol, number, string)
[^] and [$] --> anchors
number or string literal --> not allowed

*/

export function parsePattern(block: readonly Thing[]): Thing<ThingType.pattern> {
    // 1. turn 3 separated dots into a single ellipsis (since operator characters are not autojoined by the tokenizer)
    block = nonoverlappingreplace(block, tripledot, p => [boxOperatorSymbol("...", p[0]!.loc)]);

    // 2. recurse into parenthesised sub-patterns
    block = nonoverlappingreplace(block, single_roundblock, b => [parsePattern(b[0]!.c)]);

    // 3. alternation syntax {a|b}
    block = nonoverlappingreplace(block, single_curlyblock, curly => {
        var curlies = curly[0]!.c;
        const items = [];
        for (; ;) {
            const index = curlies.findIndex(i => typecheck(ThingType.operator)(i) && i.v === "|");
            if (index >= 0) {
                const chunk = curlies.slice(0, index);
                items.push(parsePattern(chunk));
                curlies = curlies.slice(index + 1);
            }
            else {
                // Last item
                items.push(parsePattern(curlies));
                break;
            }
        }
        return [alternatives(items, "{", "|", "}", curlies[0]?.loc ?? UNKNOWN_LOCATION)];
    });

    // 4. capture / literal / type shorthand in square brackets
    block = nonoverlappingreplace(block, single_squareblock, sq => {
        const squareblock = sq[0]!;
        var inner = removed_whitespace(squareblock.c);
        const test = (pat: Thing<ThingType.pattern>) => matchPattern(inner, pat, false).length > 0;
        if (inner.length === 0) {
            throw new RuntimeError("empty control group block", squareblock.loc);
        }
        // literal matcher: [=xyz]
        if (test(square_literal)) {
            return [matchvalue(inner[1]!, "[=", "]")];
        }
        if (test(square_anchor)) {
            const s = inner[0]!.v as string;
            return [anchor(s === "^", `[${s}]`, inner[0]!.loc)];
        }
        // capture forms start with a name; try patterns in order
        if (test(square_only_name_invalid)) {
            throw new RuntimeError("expected type or subpattern after capture group name", squareblock.loc)
        }
        if (test(square_capture_by_type)) {
            const name = inner[0] as Thing<ThingType.name>;
            const tok = inner[2]!;
            const ty = typeNameToThingType(tok.v, tok.loc);
            return [grouped(name, [matchtype(ty, "", tok.loc)], "[", squareblock.c.slice(1).map(o => unparse(o)).join("") + "]", name.loc)];
        }
        if (test(square_capture_subpattern)) {
            const name = inner[0] as Thing<ThingType.name>;
            const pat = parsePattern((inner[1] as Thing<ThingType.roundblock>).c);
            return [grouped(name, pat.c, "[", "]", name.loc)];
        }
        // pass through [+] markers for repeat code
        if (test(square_only_plus)) {
            return sq;
        }
        throw new RuntimeError("could not parse control group block", squareblock.loc);
    });

    // 5. handle repeat syntax: x ... (lazy) or x ... [+] (greedy)
    block = nonoverlappingreplace(block, repeat_pattern, matched => {
        const item = matched[0]!;
        var greedy = false, rest: Thing[] = [];
        // check if the match includes a squareblock (which would be [+] for greedy)
        const last_item = last(matched)!;
        if (matched.length > 2 && last_item.t === ThingType.squareblock) {
            // validate it's exactly [+]
            if (last_item.c.length === 1 && last_item.c[0]!.t === ThingType.operator && last_item.c[0]!.v === "+") {
                greedy = true;
            } else {
                // Put the unmatched space and [] back
                rest = matched.slice(matched.findIndex(v => v.v === "...") + 1);
            }
        }
        var patitem = parsePattern([item]);
        if (patitem.c.length === 1) patitem = patitem.c[0] as any;
        const ending = matched.slice(1).map(i => unparse(i)).join("");
        if (patitem.v.t === PatternType.capture_group) {
            var inner = patitem.c.slice(1), inner0 = inner[0]!;
            if (inner.length === 1 && inner0.v.t === PatternType.dot) {
                inner = [alternatives([inner0, required_space], inner0.s0, inner0.sj, inner0.s1, inner0.loc)];
            }
            return [grouped(patitem.c[0] as Thing<ThingType.name>, [repeat(greedy, inner, "", ending, item.loc)], patitem.s0, patitem.s1, patitem.loc)]
        }
        return [repeat(greedy, [patitem], "", ending, item.loc), ...rest];
    });

    // Yell for stray [+]'s
    nonoverlappingreplace(block, single_squareblock, () => {
        throw new RuntimeError("expected a repeat before greedy indicator");
    });

    // 6. spaces/newlines represent any amount of space;
    //    newlines match themselves literally.
    block = nonoverlappingreplace(block, required_space, spaces => {
        const s = spaces.map(p => p.v).join("");
        if (s === "\n") return [matchvalue(spaces[0]!)];
        const loc = spaces[0]!.loc;
        return s.length > 1 ? [
            repeat(true, [
                matchtype(ThingType.space, s, loc)
            ])
        ] : [
            alternatives([
                repeat(true, [
                    matchtype(ThingType.space, s, loc)
                ], ""),
                nothing,
            ], "", "", "", loc)
        ];
    });

    // 7. convert operators to literals
    block = nonoverlappingreplace(block, literal_operator, op => {
        return [matchvalue(op[0]!)];
    });

    // 8. convert remaining names to single-element wildcards
    block = nonoverlappingreplace(block, single_wildcard, match => {
        const t = match[0]!;
        return [grouped(t as Thing<ThingType.name>, [dot()], "", "", t.loc)];
    });

    // 9. bail on everything else
    nonoverlappingreplace(block, other_invalid, tokens => {
        throw new RuntimeError("not valid here", tokens[0]!.loc);
    });

    // require("util").inspect.defaultOptions.depth = Infinity;
    // console.log(block);

    return sequence(block, "(", ")", block[0]?.loc ?? UNKNOWN_LOCATION);
}

export function nonoverlappingreplace<T extends ThingType | string>(block: readonly Thing<T>[], pattern: Thing<ThingType.pattern>, replace: (slice: Thing[]/*, bindings: [Thing, Thing | Thing[]][]*/) => Thing<T>[]): readonly Thing<T>[] {
    const matches = matchPattern(block, pattern, true);
    for (var last = 0, shrinkage = 0, i = 0; i < matches.length; i++) {
        const { span, /*bindings*/ } = matches[i]!, start = span[0], end = span[1];
        if (start < last) continue;
        const replaceWith = replace(block.slice(start - shrinkage, end - shrinkage)/*, bindings*/);
        block = block.toSpliced(start - shrinkage, end - start, ...replaceWith);
        shrinkage += end - start - replaceWith.length;
        last = end;
    }
    return block;
}

export const metapattern_location = new LocationTrace(0, 0, new URL("backolon:internal_metapattern"));

export const removed_whitespace = <T extends ThingType | string>(args: readonly Thing<T>[]): readonly Thing<T>[] => nonoverlappingreplace(args, required_space, () => []);

const matchtype = (t: ThingType, src = "", loc = metapattern_location) => pattern(PatternType.match_type, t, loc, [], src);
const matchvalue = (o: Thing, start = "", end = "") => pattern(PatternType.match_value, 0, o.loc, [o], start, end);
const sequence = (o: readonly Thing[], start = "", end = "", loc = o[0]?.loc ?? metapattern_location) => pattern(PatternType.sequence, 0, loc, o, start, end);
const alternatives = (o: readonly Thing[], start = "", join = "", end = "", loc = o[0]?.loc ?? metapattern_location) => pattern(PatternType.alternatives, 0, loc, o, start, end, join);
const optional = (x: Thing<ThingType.pattern>) => alternatives([x, nothing]);
const repeat = (g: boolean, o: Thing[], start = "", end = "", loc = o[0]?.loc ?? metapattern_location) => pattern(PatternType.repeat, g, loc, o, start, end);
const anchor = (start: boolean, src = "", loc = metapattern_location) => pattern(PatternType.anchor, start, loc, [], src);
const entire = (o: Thing[], start = "", end = "", loc = o[0]?.loc ?? metapattern_location) => sequence([anchor(true, start, loc), ...o, anchor(false, end, loc)], "", "", loc);
const grouped = (name: Thing<ThingType.name>, body: readonly Thing[], start: string, end = "", loc = name.loc) => pattern(PatternType.capture_group, 0, loc, [name, ...body], start, end);
const dot = (loc = metapattern_location) => pattern(PatternType.dot, 0, loc, []);

const operator = (s: string) => boxOperatorSymbol(s, metapattern_location);

const singledot = matchvalue(operator("."));
const tripledot = sequence([singledot, singledot, singledot]);
const nothing = sequence([]);
const required_space = repeat(true, [alternatives([matchtype(ThingType.space), matchtype(ThingType.newline)])]);
const optional_space = optional(required_space);
const single_roundblock = matchtype(ThingType.roundblock);
const single_curlyblock = matchtype(ThingType.curlyblock);
const single_squareblock = matchtype(ThingType.squareblock);

// metapatterns used inside square brackets
const square_literal = entire([matchvalue(operator("=")), dot()]);
const square_only_name_invalid = entire([matchtype(ThingType.name)]);
const square_only_plus = entire([matchvalue(operator("+"))]);
const square_capture_by_type = entire([
    matchtype(ThingType.name),
    matchvalue(operator(":")),
    matchtype(ThingType.name),
]);
const square_capture_subpattern = sequence([
    anchor(true),
    matchtype(ThingType.name),
]);
const square_anchor = entire([alternatives([
    matchvalue(boxOperatorSymbol("^")),
    matchvalue(boxOperatorSymbol("$")),
])]);

// repeat pattern: item ... [suffix] where suffix is optional and [+] means greedy
// allows spaces/newlines between item and ... and between ... and suffix
const repeat_pattern = sequence([
    dot(),
    optional_space,
    matchvalue(operator("...")),
    optional(sequence([optional_space, matchtype(ThingType.squareblock)])),
]);

// patterns for step 7-9: match individual raw tokens to convert them to patterns
const single_wildcard = matchtype(ThingType.name);
const literal_operator = matchtype(ThingType.operator);
const other_invalid = alternatives([matchtype(ThingType.number), matchtype(ThingType.string), matchtype(ThingType.stringblock)]);

export function typeNameToThingType(name: string, loc: LocationTrace): ThingType {
    const t = ThingType[name as any] as any as ThingType | undefined;
    if (t === undefined) {
        throw new RuntimeError("Unknown type " + name, loc);
    }
    return t;
    // switch (name) {
    //     case "nil": return ThingType.nil;
    //     case "number": return ThingType.number;
    //     case "string": return ThingType.string;
    //     case "name": return ThingType.name;
    //     case "operator": return ThingType.operator;
    //     case "space": return ThingType.space;
    //     case "roundblock": return ThingType.roundblock;
    //     case "squareblock": return ThingType.squareblock;
    //     case "curlyblock": return ThingType.curlyblock;
    //     case "topblock": return ThingType.topblock;
    //     case "stringblock": return ThingType.stringblock;
    //     default: 
    // }
}
