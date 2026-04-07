import { floor } from "lib0/math";
import { javaHash, rotate32, x23 } from "./utils";

export class LocationTrace {
    constructor(
        public line: number,
        public col: number,
        public file: URL,
        public source: [string, LocationTrace] | null = null) { }

}
export const UNKNOWN_LOCATION = new LocationTrace(0, 0, new URL("about:unknown"));
function formatTrace(trace: LocationTrace, message: string, sources: Record<string, string>): string {
    const src = sources[trace.file.href];
    var lineInfo = "";
    if (src) {
        const lines = src.split("\n");
        const relevantLine = lines[trace.line] || "";
        const lineNumberString = trace.line + 1 + "";
        lineInfo = `\n${lineNumberString} | ${relevantLine}\n${" ".repeat(lineNumberString.length)} | ${" ".repeat(trace.col)}^`;
    }
    return `${trace.file}:${trace.line + 1}:${trace.col + 1}: ${message}${lineInfo}${trace.source ? indentFrame("\n" + formatTrace(trace.source[1], trace.source[0], sources), "> ") : ""}`;
}

interface Hashed {
    readonly hash: number;
    format(onSources: Record<string, string>): string;
}

export class ErrorNote implements Hashed {
    public readonly hash: number;
    constructor(public readonly message: string, public readonly loc: LocationTrace) {
        this.hash = javaHash(message) ^ rotate32(javaHash(loc.file.href), 17) ^ rotate32(loc.line ^ 0x1a2b3c4d, 22) ^ rotate32(loc.col ^ 0xf0e1c2d3, 3);
    }
    format(onSources: Record<string, string>) {
        return formatTrace(this.loc, this.message, onSources);
    }
}

export class RepeatedErrorNote implements Hashed {
    public readonly hash: number;
    constructor(public readonly subNotes: readonly Hashed[], public readonly count: number) {
        this.hash = 0x12131415 + rotate32(count ^ 0x12345678, 5) ^ subNotes.reduce((a, b) => x23(a, b.hash), 0xFF11EEAA);
    }
    format(onSources: Record<string, string>) {
        return this.subNotes.map(b => indentFrame(b.format(onSources), ": ")).join("\n") + "\n:--> " + formatRepeatSummary(this.subNotes.length, this.count);
    }
}

export class BackolonError extends Error {
    constructor(message: string, public trace: LocationTrace = UNKNOWN_LOCATION, public notes: ErrorNote[] = []) {
        super(message);
        this.name = this.constructor.name;
    }
    displayOn(sources: Record<string, string>): string {
        return formatTrace(this.trace, "error: " + this.message, sources) + "\n" + compressedNoteTracebacks(this.notes, sources) + "\n";
    }
    addNote(message: string, loc: LocationTrace) {
        this.notes.push(new ErrorNote(message, loc));
    }
}

export class ParseError extends BackolonError { }
export class RuntimeError extends BackolonError { }

function compressedNoteTracebacks(lines: ErrorNote[], sources: Record<string, string>, minRep = 8): string {
    const x = shortenRepeats(lines, minRep);
    return x.map(b => b.format(sources)).join("\n");
}
function shortenRepeats(x: Hashed[], minRep: number): Hashed[] {
    for (; ;) {
        const best = findBestRepeat(x, minRep);
        if (!best) break;

        const start = best[0], size = best[1], count = best[2];
        x = [
            ...x.slice(0, start),
            new RepeatedErrorNote(shortenRepeats(x.slice(start, start + size), minRep), count),
            ...x.slice(start + size * count),
        ];
    }
    return x;
}

function findBestRepeat(lines: Hashed[], minRep: number): [start: number, size: number, count: number] | null {
    const n = lines.length;
    var best: [start: number, size: number, count: number] | null = null;
    var bestSavings = 0;
    var bestAll = 0;

    for (var start = 0; start < n - 1; start++) {
        for (var size = 1; start + size * 2 <= n; size++) {
            const maxRepeats = floor((n - start) / size);
            var count = 1;
            while (count + 1 <= maxRepeats && memcmp(lines, start, start + count * size, size)) count++;
            if (count < 2) continue;
            const totalStrings = count * size;
            if (totalStrings < minRep) continue;

            const savings = totalStrings - size;
            if (savings > bestSavings || (savings === bestSavings && totalStrings > bestAll)) {
                bestSavings = savings;
                bestAll = totalStrings;
                best = [start, size, count];
            }
        }
    }

    return best;
}

function memcmp(lines: Hashed[], a: number, b: number, size: number): boolean {
    for (var k = 0; k < size; k++) {
        if (lines[a + k]!.hash !== lines[b + k]!.hash) return false;
    }
    return true;
}

function indentFrame(frame: string, indent: string): string {
    return frame.split("\n").map(line => indent + line).join("\n");
}

function formatRepeatSummary(size: number, count: number): string {
    const countPlural = size > 1 ? `${size} frames` : "frame";
    const timesPlural = count > 1 ? "s" : "";
    return `previous ${countPlural} repeated ${count} time${timesPlural}`;
}

