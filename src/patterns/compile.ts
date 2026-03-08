import { Thing, ThingType } from "../objects/thing";
import { Pattern, PatternType } from "./internals";

export type Command =
    | [PatternType.alternatives, ...number[]] // relative jump to these offsets
    | [PatternType.dot]
    | [PatternType.anchor, start: boolean]
    | [PatternType.match_type, value: ThingType]
    | [PatternType.match_value, value: Thing]
    | [PatternType.capture_group, name: Thing<ThingType.name>, end: boolean, single: boolean]
    ;

export type PatternProgram = Command[];

/** also memoizes the program */
export function compile(thing: Thing<ThingType.pattern>): PatternProgram {
    const data = thing.v;
    if (data.p) return data.p;
    const prog: PatternProgram = [];
    const stuff = (i = 0) => {
        for (var child of thing.c.slice(i)) {
            prog.push(...compile(child as any));
        }
    }
    switch (data.t) {
        case PatternType.sequence:
            stuff();
            break;
        case PatternType.alternatives:
            const top: Command = [PatternType.alternatives];
            const ends: [number, number[]][] = [];
            prog.push(top);
            for (var child of thing.c) {
                top.push(prog.length);
                prog.push(...compile(child as any));
                const end: Command = [PatternType.alternatives];
                ends.push([prog.length, end]);
                prog.push(end);
            }
            prog.pop();
            ends.pop();
            for (var [from, cmd] of ends) {
                cmd.push(prog.length - from);
            }
            break;
        case PatternType.repeat:
            stuff();
            prog.push(data.gsv ? [PatternType.alternatives, -prog.length, 1] : [PatternType.alternatives, 1, -prog.length]);
            break;
        case PatternType.capture_group:
            prog.push([PatternType.capture_group, thing.c[0] as any, false, thing.c.length === 2 && (thing.c[1]!.v as Pattern).t >= PatternType.dot]);
            stuff(1);
            prog.push([PatternType.capture_group, thing.c[0] as any, true, false]);
            break;
        case PatternType.dot:
            prog.push([PatternType.dot]);
            break;
        case PatternType.anchor:
            prog.push([PatternType.anchor, data.gsv as boolean]);
            break;
        case PatternType.match_type:
            prog.push([PatternType.match_type, data.gsv as ThingType]);
            break;
        case PatternType.match_value:
            prog.push([PatternType.match_value, thing.c[0]!]);
            break;
    }
    (data as any).p = prog;
    return prog;
}
