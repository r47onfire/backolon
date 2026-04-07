import { imul } from "lib0/math.js";

export const rotate32 = (x: number, shr: number) => (x << shr) | (x >> (32 - shr));

export function javaHash(s: string) {
    var hash = 0;
    for (var i = 0; i < s.length; i++) hash = (imul(hash, 31) + s.charCodeAt(i)) | 0;
    return hash;
}

export const x23 = (a: number, b: number) => imul((a + 0x1a2b3c4d) ^ b, rotate32(b, 23));
