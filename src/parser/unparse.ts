import { isArray } from "lib0/array";
import { Thing, ThingType, typecheck } from "../objects/thing";

export class Unparser {
    counter = 0;
    seen = new Map<Thing, number>();
    pre(thing: Thing): string {
        return thing.s0;
    }
    join(thing: Thing, parts: string[]): string {
        if (typecheck(ThingType.paramdescriptor)(thing) && isArray(thing.sj)) return parts.map((e, i) => e + (thing.sj[i] ?? "")).join("");
        if (typecheck(ThingType.map)(thing) && parts.length === 0) return ":"; // empty map = [:], vs empty list = []
        return parts.join(thing.sj);
    }
    post(thing: Thing) {
        return thing.s1;
    }
    begin() {
        this.counter = 0;
        this.seen.clear();
    }
    end() {
        this.seen.clear();
    }
    unparse(thing: Thing): string {
        this.begin();
        this.walk(thing);
        const str = this.stringify(thing);
        this.end();
        return str;
    }
    walk(thing: Thing): void {
        if (this.seen.has(thing)) {
            this.seen.set(thing, -2);
        } else {
            this.seen.set(thing, -1);
            for (var c of thing.c) this.walk(c);
        }
    }
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
        str += this.join(thing, thing.c.map(c => this.stringify(c)));
        str += this.post(thing);
        return str;
    }
}

export const DEFAULT_UNPARSER = new Unparser;
