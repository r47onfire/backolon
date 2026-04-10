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

/**
 * Compile a pattern Thing into an executable pattern program and memoize it on the pattern object.
 */
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
            // simple peephole optimization
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
    (data as any).p = optimize(prog);
    return prog;
}

function optimize(prog: (Command | null)[]): PatternProgram {
    // 1: replace all jumps with their true targets
    // console.log("original program", "\n" + disassemblePattern(prog as PatternProgram));
    var changing = true;
    while (changing) {
        changing = false;
        for (var i = 0; i < prog.length; i++) {
            const cmd = prog[i]!;
            if (cmd[0] === PatternType.alternatives) {
                const newOffsets: number[] = [];
                for (var offset of cmd.slice(1)) {
                    const targetIndex = i + offset;
                    const instAtTarget = prog[targetIndex]!;
                    if (instAtTarget?.[0] === PatternType.alternatives) {
                        changing = true;
                        for (var offset2 of instAtTarget.slice(1)) {
                            if (!newOffsets.includes(offset + offset2) && (offset + offset2) !== 0) {
                                newOffsets.push(offset + offset2);
                            }
                        }
                    } else {
                        newOffsets.push(offset);
                    }
                }
                prog[i] = [PatternType.alternatives, ...newOffsets];
            }
        }
    }
    // 2: replace non-directly-targeted jumps (i.e. ones after another jump) with NOPs
    var prevWasJump = false;
    for (var i = 0; i < prog.length; i++) {
        if (prevWasJump && prog[i]![0] === PatternType.alternatives) {
            prog[i] = null;
            prevWasJump = true;
        } else {
            prevWasJump = prog[i]![0] === PatternType.alternatives;
            if (prevWasJump && prog[i]!.length === 2 && prog[i]![1] === 1) {
                // jump +1
                prog[i] = null;
            }
        }
    }
    // console.log("jump-replaced program", "\n" + disassemblePattern(prog as PatternProgram));
    // 3: remove NOPs and adjust jump offsets
    for (var i = 0; i < prog.length; i++) {
        if (prog[i] === null) {
            prog.splice(i, 1);
            // adjust things jumping backwards
            for (var j = i; j < prog.length; j++) {
                if (prog[j]?.[0] === PatternType.alternatives) {
                    (prog[j] as number[])!.forEach((d, index, a) => {
                        if (index > 0 && (j + d) < i) a[index]!++;
                    });
                }
            }
            // adjust things jumping forwards
            for (var j = 0; j < i; j++) {
                if (prog[j]?.[0] === PatternType.alternatives) {
                    (prog[j] as number[])!.forEach((d, index, a) => {
                        if (index > 0 && (j + d) > i) a[index]!--;
                    });
                }
            }
            i--;
        }
    }
    // console.log("optimized program", "\n" + disassemblePattern(prog as PatternProgram));
    // if (prog.length > 15) throw 1;
    return prog as PatternProgram;
}
