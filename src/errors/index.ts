/** Error formatting: renders a message together with the offending source line and a caret span under it. */
import { max } from "lib0/math";

// what is this
/**
 * Formats `message` as `file:line:col: message`, followed by the source line
 * containing `start` and a row of `^` under the span `start..end` (clipped to
 * that line, with a "..." suffix if the span runs past it).
 *
 * `getSource` supplies the text of a source file by URL; if it returns an
 * empty string, only the header line is produced.
 */
const formatTrace = (file: URL, start: number, end: number, message: string, getSource: (url: URL) => string): string => {
    const src = getSource(file);
    var lineInfo = "", line = -1, col = -1;
    if (src) {
        const lines = src.split("\n");
        for (
            line = 0, col = start;
            line < lines.length && col >= lines[line]!.length;
            col -= lines[line++]!.length);
        if (line < lines.length) {
            const relevantLine = lines[line]!;
            const lineNumberString = line + 1 + "";
            var spanLength = end - start;
            var suffix = "";
            if (spanLength > (relevantLine.length - col)) {
                spanLength = relevantLine.length - col;
                suffix = "...";
            }
            spanLength = max(spanLength, 1);
            lineInfo = `\n${lineNumberString} | ${relevantLine}\n${" ".repeat(lineNumberString.length)} | ${" ".repeat(col) + "^".repeat(spanLength) + suffix}`;
        }
    }
    return `${file.href}:${line + 1}:${col + 1}: ${message}${lineInfo}`;
}