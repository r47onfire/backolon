import { map } from "lib0/object";
import { extractSymbolName, isAtom, isBlock, Thing, ThingType, typecheck } from "../objects/thing";
import { javaHash, rotate32, x23 } from "../utils";
import { PatternProgram } from "./compile";

export enum PatternType {
    // containers
    /**
     * Sequence of things in order `abcd`
     */
    sequence,
    /**
     * List of options to be matched `{a|b|c|d}`
     */
    alternatives,
    /**
     * Repeat (one or more) `(a)...`
     */
    repeat,
    /**
     * Capture group into a symbol name `[name(a)]`
     */
    capture_group,
    // atoms
    /**
     * Matches anything as a wildcard. Used for bare names like `x`.
     */
    dot,
    /**
     * Force the match to be at the start `[^]`, or at the end `[$]`.
     */
    anchor,
    /**
     * Match a value with a certain {@link ThingType} `[:type]`
     */
    match_type,
    /**
     * Match that literal value `[=value]`
     */
    match_value,
}

/**
 * Represents a pattern variant for pattern-matching.
 */
export interface Pattern {
    /**
     * The compiled IR program of this pattern, if the pattern has been compiled.
     */
    readonly p?: PatternProgram;
    /**
     * The variant of the pattern.
     */
    readonly t: PatternType,
    /**
     * * For {@link PatternType#repeat repeat}, true if the repeat is greedy.
     * * For {@link PatternType#anchor anchor}, true if the anchor is to the start.
     * * For {@link PatternType#match_type match_type}, it is the numeric {@link ThingType} to be matched.
     * * For all other pattern types, it is unused.
     */
    readonly gsv: boolean | number;
}

export class NFASubstate {
    public readonly h: number;
    constructor(
        /** start index */
        public readonly s: number,
        /** pattern program */
        public readonly p: PatternProgram,
        /** index into program */
        public readonly i: number,
        /** binding spans */
        public readonly b: Record<string, readonly [number, number | null]> = {},
        /** atomic binding names */
        public readonly ab: string[] = [],
        /** binding source symbols */
        public readonly bs: Record<string, Thing<ThingType.name>> = {},
    ) {
        var hash = rotate32(i, 27) ^ (rotate32(s, 22) + 0xFEDCBA98);
        hash ^= map(b, (val, key) => rotate32(javaHash(key) + val[0] ^ (val[1] ?? 0x12345678), 29)).reduce(x23, 0);
        this.h = hash;
    }

    /** is done */
    get x() {
        return this.i >= this.p.length;
    }

    a(input: Thing | null, inputIndex: number, isAtEnd: boolean): NFASubstate[] {
        const item = this.p[this.i];
        if (!item) return [this]; // we're done, but that will be caught
        switch (item[0]) {
            case PatternType.alternatives:
                return item.slice(1).map(i => this.u(this.i + i));
            case PatternType.capture_group:
                return [this.u(this.i + 1, item[1], inputIndex, item[2], item[3])];
            case PatternType.dot:
                // ThingType.pattern is needed to for the metapattern parsing to work
                return input ? ((isAtom(input) || isBlock(input) || typecheck(ThingType.apply, ThingType.pattern)(input)) ? [this.n()] : []) : [this];
            case PatternType.anchor:
                return (item[1] ? inputIndex === 0 : isAtEnd) ? [this.n()] : [];
            case PatternType.match_type:
                return input !== null ? (input.t === item[1] ? [this.n()] : []) : [this];
            case PatternType.match_value:
                return input !== null ? (input.v === item[1].v ? [this.n()] : []) : [this];
        }
    }
    n() {
        return this.u(this.i + 1);
    }

    u(newIndex: number, binding: Thing<ThingType.name> | null = null, bindingIndex = 0, bindingIsSecond = false, newAtomic = false): NFASubstate {
        var bindings = this.b;
        var sources = this.bs;
        var atomics = this.ab;
        if (binding) {
            const name = extractSymbolName(binding);
            bindings = { ...bindings };
            if (bindingIsSecond) {
                bindings[name] = bindings[name]!.with(1, bindingIndex) as any;
            } else {
                sources = { ...sources };
                bindings[name] = [bindingIndex, null];
                sources[name] = binding;
            }
            if (newAtomic) {
                atomics = atomics.toSpliced(Infinity, 0, name!);
            }
        }
        return new NFASubstate(this.s, this.p, newIndex, bindings, atomics, sources);
    }
}
