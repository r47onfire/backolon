import { expect } from "bun:test";
import { keys } from "lib0/object";
import { BackolonError, ErrorNote, LocationTrace, parse, ThingType } from "../src";

export const F = new URL("about:test");
export const L = new LocationTrace(0, 0, F);

type ASTSpec = {
    t: ThingType,
    v?: any,
    c: readonly ASTSpec[]
}
function checkAST(ast: any, spec: ASTSpec, path: string) {
    for (var prop of keys(spec)) {
        const newpath = path + "." + prop;
        const failMsg = "AST failed to match at " + newpath;
        const desc = spec[prop as keyof ASTSpec]!;
        if (Array.isArray(desc)) {
            expect(ast[prop], failMsg).toBeArrayOfSize(desc.length);
            for (var i = 0; i < desc.length; i++) {
                checkAST(ast[prop][i], desc[i]!, path + "." + prop + "[" + i + "]");
            }
        } else if (typeof desc === "object" && desc !== null) {
            checkAST(ast[prop], desc, newpath);
        } else {
            expect(ast[prop], failMsg).toEqual(desc);
        }
    }
}

export function makespec(type: ThingType, value: any | null = null, ...children: readonly ASTSpec[]): ASTSpec {
    const obj: ASTSpec = { t: type, c: children };
    if (value !== null) obj.v = value;
    return obj;
}

export function expectParse(p: string, spec: ASTSpec) {
    try {
        checkAST(parse(p, F), spec, "");
    } catch (e) {
        if (e instanceof BackolonError) {
            expect.unreachable(e.displayOn({ [F.href]: p }) + e.stack);
        }
        else throw e;
    }
}

export function expectParseError(p: string, error: string, note?: string) {
    try {
        parse(p, F);
        expect.unreachable("Did not throw an error!");
    } catch (e: any) {
        expect(e).toBeInstanceOf(BackolonError);
        expect(e.message).toEqual(error);
        if (note !== undefined) {
            expect(e.notes.map((n: ErrorNote) => n.message)).toContain(note);
        }
    }
}

// export function expectEval(p: string, spec: ASTSpec) {
//     try {
//         checkAST(TODO parse(p, F), spec, "");
//     } catch (e) {
//         if (e instanceof BackolonError) {
//             expect.unreachable(e.displayOn({ [F.href]: p }) + e.stack);
//         }
//         else throw e;
//     }
// }

// export function expectEvalError(p: string, error: string, note?: string) {
//     try {
//         TODO parse(p, F);
//         expect.unreachable("Did not throw an error!");
//     } catch (e: any) {
//         expect(e).toBeInstanceOf(BackolonError);
//         expect(e.message).toEqual(error);
//         if (note !== undefined) {
//             expect(e.notes.map((n: ErrorNote) => n.message)).toContain(note);
//         }
//     }
// }
