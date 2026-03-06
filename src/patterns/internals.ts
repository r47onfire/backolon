import { imul } from "lib0/math";
import { map } from "lib0/object";
import { RuntimeError } from "../errors";
import { extractSymbolName, isValuePattern, Thing, ThingType, typecheck } from "../objects/thing";
import { javaHash, rotate32 } from "../utils";


const x23 = (a: number, b: number) => imul((a + 0x1a2b3c4d) ^ b, rotate32(b, 23));

export class NFASubstate {
    public readonly _hash: number;
    constructor(
        /** start index */
        public readonly s: number,
        /** path state */
        public readonly p: readonly (readonly [Thing, number])[],
        /** binding spans */
        public readonly b: Record<string, readonly [number, number | null]> = {},
        /** complete */
        public readonly x: boolean = false,
        /** atomic binding names */
        public readonly ab: string[] = [],
        /** binding source symbols */
        public readonly bs: Record<string, Thing<ThingType.name>> = {},
    ) {
        var hash = p.map(p => p[0].h! ^ rotate32(p[1], 19)).reduce(x23, 0) ^ (rotate32(s, 22) + 0xFEDCBA98);
        hash ^= map(b, (val, key) => rotate32(javaHash(key) + val[0] ^ (val[1] ?? 0x12345678), 29)).reduce(x23, 0);
        this._hash = hash;
    }

    a(input: Thing | null, inputIndex: number, isAtEnd: boolean): NFASubstate[] {
        // Handle atomic commands (no children)
        const { _thing: cmd, _index: pIndex } = this.c(1);
        const { _thing: cmd2, _index: pIndex2 } = this.c(2);
        const enter = () => this.u(0, cmd, 0);
        const exit = () => this.u(1, null, pIndex2 + 1);
        const loop = () => this.u(0, null, 0);
        const next = () => (
            cmd2 !== null && typecheck(ThingType.alternatives)(cmd2)
                ? exit() // Alternatives jump out always
                : this.u(0, null, pIndex + 1) // otherwise just go to the next one
        );
        const nonPatternError = (src: Thing) => {
            return new RuntimeError("Non-pattern in pattern!!", src.loc);
        }
        if (cmd === null) {
            // We fell off the end of the group. Go back up one.
            if (this.p.length === 1) {
                // No parent = we're done.
                return [
                    this.d(),
                ];
            }
            switch (cmd2!.t) {
                case ThingType.sequence:
                case ThingType.alternatives:
                    return [exit()];
                case ThingType.repeat:
                    return cmd2!.v ? [
                        // Greedy
                        loop(),
                        exit(),
                    ] : [
                        // Not greedy
                        exit(),
                        loop(),
                    ];
                case ThingType.group:
                    return [
                        this.u(1, null, pIndex2 + 1, cmd2!.c[0]! as any, inputIndex, true),
                    ]
                case ThingType.anchor:
                case ThingType.matchvalue:
                case ThingType.matchtype:
                    throw new RuntimeError("Atomic command reached compound command exit code!!", cmd2!.loc);
                default:
                    throw nonPatternError(cmd2!);
            }
        }

        const firstChild = cmd.c[0]!;
        const secondChild = cmd.c[1]!;
        switch (cmd.t) {
            case ThingType.sequence:
            case ThingType.repeat:
                return [enter()];
            case ThingType.alternatives:
                return cmd.c.map((_, i) =>
                    this.u(0, cmd, i));
            case ThingType.anchor:
                return (cmd.v ? (inputIndex === 0) : isAtEnd) ? [next()] : [];
            case ThingType.group:
                return [this.u(0, cmd, 1, firstChild as any, inputIndex, false, cmd.c.length === 2 && isValuePattern(secondChild))];
            case ThingType.matchvalue:
                if (input === null) return [this];
                if (!typecheck(firstChild.t as ThingType)(input) || input.h !== firstChild.h) return [];
                return [next()];
            case ThingType.matchtype:
                if (input === null) return [this];
                if (!typecheck(cmd.v as ThingType)(input)) return [];
                return [next()];
            case ThingType.matchany:
                return [input === null ? this : next()];
            default:
                throw nonPatternError(cmd);
        }
    }
    c(index: number): { _thing: Thing | null, _index: number } {
        const cur = this.p.at(-index)!;
        return { _thing: cur?.[0].c[cur?.[1]] ?? null, _index: cur?.[1] };
    }

    u(popElements: number, push: Thing | null, newIndex: number, binding: Thing<ThingType.name> | null = null, bindingIndex = 0, bindingIsSecond = false, newAtomic = false): NFASubstate {
        const newPath = this.p.slice();
        for (; popElements > 0; popElements--) newPath.pop();
        if (push) newPath.push([push, newIndex]);
        else newPath.push(newPath.pop()!.with(1, newIndex) as [Thing, number]);
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
        return new NFASubstate(this.s, newPath, bindings, false, atomics, sources);
    }
    d(): NFASubstate {
        return new NFASubstate(this.s, [], this.b, true, this.ab, this.bs);
    }
}
