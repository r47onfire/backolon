import { BackolonError, ErrorNote } from "@r47onfire/backolon";
import { expect, test } from "bun:test";
import { F, L } from "./astCheck";


function makeRepeatedNotes(line: string, count: number) {
    const notes: ErrorNote[] = [];
    for (var i = 0; i < count; i++) {
        notes.push(new ErrorNote(line, L));
    }
    return notes;
}

test("collapses long repeated single frames", () => {
    const notes = makeRepeatedNotes("note: recursive frame", 100);
    const err = new BackolonError("too much recursion", L, notes);
    const displayed = err.displayOn({ [F.href]: "" });

    expect(displayed).toContain("previous frame repeated 100 times");
    expect(displayed).not.toContain("note: recursive frame\nnote: recursive frame");
});
test("collapses repeated block patterns", () => {
    const block = [
        "note: frame A",
        "note: frame B",
        "note: frame C",
    ];
    const notes: ErrorNote[] = [];
    for (var i = 0; i < 50; i++) {
        for (const line of block) {
            notes.push(new ErrorNote(line, L));
        }
    }

    const err = new BackolonError("too much recursion", L, notes);
    const displayed = err.displayOn({ [F.href]: "" });

    expect(displayed).toContain("previous 3 frames repeated 50 times");
    expect(displayed).toContain("note: frame A");
    expect(displayed).toContain("note: frame B");
    expect(displayed).toContain("note: frame C");
    expect(displayed.split("note: frame A").length - 1).toEqual(1);
});
