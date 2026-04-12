import { stringify } from "lib0/json";
import { indent } from "./utils";

const internedStrings = new Map<string, string>();
var internStringCounter = 0;
export function internString(s: string): string {
    if (!internedStrings.has(s)) {
        internedStrings.set(s, "_str" + (internStringCounter++) + s.toLowerCase().replaceAll(/\W/g, ""));
    }
    return internedStrings.get(s)!;
}

export function getInternedStrings(): string {
    return `const ${indent([...internedStrings].map(([val, name]) => `\n${name} = ${stringify(val)}`).join(", "))};`;
}
