import { isArray } from "lib0/array";
import { Thing, ThingType, typecheck } from "../objects/thing";

/**
 * Class for converting Things back into source text, or at least a readable
 * representation.
 */
export class Unparser {
    counter = 0;
    seen = new Map<Thing, number>();
    /** Returns the text to be put before the contents of the given Thing. */
    pre(thing: Thing): string {
        return thing.s0;
    }
    /**
     * Takes the string source of the children and joins it into a single string
     * based on the Thing.
     */
    join(thing: Thing, parts: string[]): string {
        if (typecheck(ThingType.paramdescriptor)(thing) && isArray(thing.sj))
            return parts.map((e, i) => e + (thing.sj[i] ?? "")).join("");
        if (typecheck(ThingType.map)(thing) && parts.length === 0) return ":"; // empty map = [:], vs empty list = []
        return parts.join(thing.sj);
    }
    /** Returns the text to be put after the contents of the given Thing. */
    post(thing: Thing) {
        return thing.s1;
    }
    /** Hook that gets called when an object is starting to be unparsed. */
    begin() {
        this.counter = 0;
        this.seen.clear();
    }
    /** Hook that gets called when an object has finished being unparsed. */
    end() {
        this.seen.clear();
    }
    /** Main entry point to unparse an object to a string. */
    unparse(thing: Thing): string {
        this.begin();
        this.walk(thing);
        const str = this.stringify(thing);
        this.end();
        return str;
    }
    /**
     * Walks the object tree recursively, and saves which objects have been seen
     * once or multiple times in `this.seen`.
     */
    walk(thing: Thing): void {
        if (this.seen.has(thing)) {
            this.seen.set(thing, -2);
        } else {
            this.seen.set(thing, -1);
            for (var c of thing.c) this.walk(c);
        }
    }
    /**
     * Stringifies the object tree, while noting shared and circular structure
     * using Scheme datums `#N=` and `#N#`.
     */
    stringify(thing: Thing): string {
        var str = "";
        const id = this.seen.get(thing);
        if (id !== undefined) {
            if (id >= 0) {
                return `#${id}#`;
            } else if (id < -1) {
                str += `#${this.counter}=`;
                this.seen.set(thing, this.counter++);
            }
        }
        str += this.pre(thing);
        str += this.join(
            thing,
            thing.c.map((c) => this.stringify(c)),
        );
        str += this.post(thing);
        return str;
    }
}

/** Default unparser */
export const DEFAULT_UNPARSER = new Unparser();
