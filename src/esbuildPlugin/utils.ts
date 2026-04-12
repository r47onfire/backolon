export function indent(string: string): string {
    return string ? string.split("\n").map(l => "    " + l).join("\n") : "";
}
