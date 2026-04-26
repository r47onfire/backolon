import { stringify } from "lib0/json";
import { max, min } from "lib0/math";
import { typeNameOf } from "../objects/thing";
import { Command, PatternProgram } from "./compile";
import { PatternType } from "./internals";

type Span = [number, number];
export function disassemblePattern(program: PatternProgram): string {
    if (program.length === 0) return "";
    const allSpans: Span[] = [];
    for (var i = 0; i < program.length; i++) {
        const inst = program[i];
        if (!inst) continue;
        if (inst[0] === PatternType.alternatives) {
            for (var d of inst.slice(1)) {
                allSpans.push([i, i + (d as number)]);
            }
        } else if (inst[0] === PatternType.lookahead && inst[3]) {
            allSpans.push([i, i + inst[3]]);
        }
    }
    const spanLanes: Span[][] = [];
    const start = (x: Span) => min(x[0], x[1]);
    const end = (x: Span) => max(x[0], x[1]);
    const overlaps = (a: Span, b: Span) => start(a) <= end(b) && end(a) >= start(b);
    const spanFitsInLane = (span: Span) => (lane: Span[]) => !lane.some(otherSpan => overlaps(otherSpan, span));
    for (var a = 0; a < allSpans.length; a++) {
        const span = allSpans[a]!;
        const freeLane = spanLanes.findIndex(spanFitsInLane(span));
        if (freeLane < 0) spanLanes.push([span]);
        else spanLanes[freeLane]!.push(span);
    }
    const lineNumberAreaWidth = Math.ceil(Math.log10(program.length));
    const lines = [];
    for (var i = 0; i < program.length; i++) {
        const cmd = program[i]!;
        const disassembly = prettifyCommand(cmd);
        const lineNumberStr = ("" + i).padStart(lineNumberAreaWidth);
        const isSource = allSpans.some(span => span[0] === i);
        const isTarget = allSpans.some(span => span[1] === i);
        const intersectingSpansLanes = spanLanes
            .map(laneSpans => laneSpans
                .filter(span => start(span) <= i && i <= end(span)));
        const lanesColumns = intersectingSpansLanes
            .map(intersectingSpans =>
                intersectingSpans.some(s => start(s) === i)
                    ? "."
                    : intersectingSpans.some(s => end(s) === i)
                        ? "'"
                        : intersectingSpans.length > 0
                            ? "|" : " ");
        const bitsToLines = (a: string[]) => a.reduce((acc: string, cur) =>
            acc +
            (cur === " " && /-/.test(acc) ? "-" : cur) +
            (/['.]/.test(acc + cur) ? "---" : "   "), "");
        const lanesColumnsStr = bitsToLines(lanesColumns) +
            (isTarget && isSource ? "-<>" : isSource ? "--<" : isTarget ? "-->" : "---");
        const updownColumnsStr = bitsToLines(
            intersectingSpansLanes
                .map((intersectingSpans, i) =>
                    intersectingSpans.length > 0 && lanesColumns[i] !== "'"
                        ? (intersectingSpans.some(s => s[0] > s[1]) ? "^" : "v")
                        : " "));
        lines.push(lineNumberStr + "  " + lanesColumnsStr + "  " + disassembly);
        lines.push(" ".repeat(lineNumberStr.length) + "  " + updownColumnsStr);
    }
    return lines.join("\n");
}

function prettifyCommand(cmd: Command) {
    if (cmd === null) return "noop";
    switch (cmd[0]) {
        case PatternType.alternatives:
            return `jump ${cmd.slice(1).map(e => e > 0 ? `+${e}` : e).join(", ")}`;
        case PatternType.capture_group:
            return `capture ${cmd[1].v} ${cmd[2] ? "end" : "start"}${cmd[3] ? " as single" : ""}`;
        case PatternType.dot:
            return "dot";
        case PatternType.anchor:
            return `anchor to ${cmd[1] ? "start" : "end"}`;
        case PatternType.match_type:
            return `match type ${typeNameOf(cmd[1])}`;
        case PatternType.match_value:
            return `match ${stringify(cmd[1].v)}`;
        case PatternType.lookahead:
            return cmd[1] ? `${cmd[2] ? "positive" : "negative"} lookahead ${cmd[3]! > 0 ? `+${cmd[3]}` : cmd[3]}` : "end lookahead";
        default: cmd[0] satisfies never;
    }
}
