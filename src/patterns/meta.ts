import { last } from "lib0/array";
import { LocationTrace, RuntimeError, UNKNOWN_LOCATION } from "../errors";
import { boxOperatorSymbol, Thing, ThingType } from "../objects/thing";
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
number or string literal --> not allowed

*/

export function parsePattern(block: readonly Thing[]): Thing<ThingType.pattern> {
    // 1. turn 3 separated dots into a single ellipsis (since operator characters are not autojoined by the tokenizer)
    block = nonoverlappingreplace(block, tripledot, p => [boxOperatorSymbol("...", p[0]!.loc)]);

    // 2. recurse into parenthesised sub-patterns
    block = nonoverlappingreplace(block, single_roundblock, b => [parsePattern(b[0]!.c)]);

    // 3. alternation syntax {a|b}
    block = nonoverlappingreplace(block, single_curlyblock, curlies => [
        alternatives(nonoverlappingreplace(curlies[0]!.c, alternation, option => {
            if (option[0]?.t === ThingType.operator && option[0]!.v === "|") option.shift();
            return [parsePattern(option)];
        }), "{", "|", "}")
    ]);

    // 4. capture / literal / type shorthand in square brackets
    block = nonoverlappingreplace(block, single_squareblock, sq => {
        const b = sq[0]!;
        var inner = nonoverlappingreplace(b.c, required_space, () => []);
        const test = (pat: Thing<ThingType.pattern>) => matchPattern(inner, pat, false).length > 0;
        if (inner.length === 0) {
            throw new RuntimeError("empty []", b.loc);
        }
        // literal matcher: [=xyz]
        if (test(square_literal)) {
            return [matchvalue(inner[1]!)];
        }
        // capture forms start with a name; try patterns in order
        if (test(square_only_name_invalid)) {
            throw new Error("expected type or subpattern after capture group name")
        }
        if (test(square_capture_by_type)) {
            const name = inner[0] as Thing<ThingType.name>;
            const tok = inner[2]!;
            const ty = typeNameToThingType(tok.v, tok.loc);
            return [grouped(name, [matchtype(ty, "", tok.loc)], "[", "]", name.loc)];
        }
        if (test(square_capture_subpattern)) {
            const name = inner[0] as Thing<ThingType.name>;
            const pat = parsePattern((inner[1] as Thing<ThingType.roundblock>).c);
            return [grouped(name, pat.c, "[", "]", name.loc)];
        }
        // pass through [+] markers for repeat code
        if (test(square_only_plus)) {
            return [b];
        }
        throw new RuntimeError("could not parse control group block", b.loc);
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
        return [repeat(greedy, [item], "", matched.slice(1).map(i => unparse(i)).join(""), item.loc), ...rest];
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

    // 7. convert remaining names to single-element wildcards
    block = nonoverlappingreplace(block, single_wildcard, match => {
        const t = match[0]!;
        return [grouped(t as Thing<ThingType.name>, [dot()], "", "", t.loc)];
    });

    // 8. bail on everything else
    nonoverlappingreplace(block, other_invalid, tokens => {
        throw new RuntimeError("not valid here", tokens[0]!.loc);
    })

    return sequence(block, "(", ")", block[0]!.loc);
}

function nonoverlappingreplace(block: readonly Thing[], pattern: Thing<ThingType.pattern>, replace: (slice: Thing[]/*, bindings: [Thing, Thing | Thing[]][]*/) => Thing[]): readonly Thing[] {
    const dotmatches = matchPattern(block, pattern, true);
    for (var last = 0, shrinkage = 0, i = 0; i < dotmatches.length; i++) {
        const { span, /*bindings*/ } = dotmatches[i]!, start = span[0], end = span[1];
        if (start < last) continue;
        const replaceWith = replace(block.slice(start - shrinkage, end - shrinkage)/*, bindings*/);
        block = block.toSpliced(start - shrinkage, end - start, ...replaceWith);
        shrinkage += end - start - replaceWith.length;
        last = end;
    }
    return block;
}

const metapattern = new LocationTrace(0, 0, new URL("about:metapattern"));

const matchtype = (t: ThingType, src = "", loc = metapattern) => pattern(PatternType.match_type, t, loc, [], src);
const matchvalue = (o: Thing) => pattern(PatternType.match_value, 0, o.loc, [o]);
const sequence = (o: readonly Thing[], start = "", end = "", loc = o[0]?.loc ?? metapattern) => pattern(PatternType.sequence, 0, loc, o, start, end);
const alternatives = (o: readonly Thing[], start = "", join = "", end = "", loc = o[0]?.loc ?? metapattern) => pattern(PatternType.alternatives, 0, loc, o, start, end, join);
const repeat = (g: boolean, o: Thing[], start = "", end = "", loc = o[0]?.loc ?? metapattern) => pattern(PatternType.repeat, g, loc, o, start, end);
const anchor = (start: boolean, src = "", loc = metapattern) => pattern(PatternType.anchor, start, loc, [], src);
const entire = (o: Thing[], start = "", end = "", loc = o[0]?.loc ?? metapattern) => sequence([anchor(true, start, loc), ...o, anchor(false, end, loc)], "", "", loc);
const grouped = (name: Thing<ThingType.name>, body: readonly Thing[], start: string, end = "", loc = name.loc) => pattern(PatternType.capture_group, 0, loc, [name, ...body], start, end);
const dot = (loc = metapattern) => pattern(PatternType.dot, 0, loc, []);

const operator = (s: string) => boxOperatorSymbol(s, metapattern);

const singledot = matchvalue(operator("."));
const tripledot = sequence([singledot, singledot, singledot]);
const nothing = sequence([]);
const required_space = repeat(true, [alternatives([matchtype(ThingType.space), matchtype(ThingType.newline)])]);
const optional_space = alternatives([required_space, nothing])
const single_roundblock = matchtype(ThingType.roundblock)
const single_curlyblock = matchtype(ThingType.curlyblock);
const single_squareblock = matchtype(ThingType.squareblock);
const alternation = sequence([alternatives([anchor(true), matchvalue(operator("|"))]), repeat(false, [dot()])]);

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

// repeat pattern: item ... [suffix] where suffix is optional and [+] means greedy
// allows spaces/newlines between item and ... and between ... and suffix
const repeat_pattern = sequence([
    dot(),
    optional_space,
    matchvalue(operator("...")),
    alternatives([
        sequence([optional_space, matchtype(ThingType.squareblock)]),
        nothing
    ])
]);

// patterns for step 7: match individual raw tokens to convert them to patterns
const single_wildcard = sequence([matchtype(ThingType.name)]);
const other_invalid = alternatives([matchtype(ThingType.operator), matchtype(ThingType.number), matchtype(ThingType.string)]);

function typeNameToThingType(name: string, loc: LocationTrace): ThingType {
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
