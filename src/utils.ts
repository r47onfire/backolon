import { imul } from "lib0/math";

/** Rotates the 32-bit integer `x` left by `shr` bits. */
export const rotate32 = (x: number, shr: number) => (x << shr) | (x >> (32 - shr));

/** Java-style string hash: `hash = 31 * hash + code unit` per character, kept as a signed 32-bit integer. */
export function javaHash(s: string) {
    var hash = 0;
    for (var i = 0; i < s.length; i++) hash = (imul(hash, 31) + s.charCodeAt(i)) | 0;
    return hash;
}

/** Scrambles two numbers into a single 32-bit hash, for combining hash values. */
export const x23 = (a: number, b: number) => imul((a + 0x1a2b3c4d) ^ b, rotate32(b, 23));
