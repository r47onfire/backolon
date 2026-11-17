import { isString } from "lib0/function";
import type { gensym } from "./runtime/env";

/**
 * A tuple of exactly `N` elements of type `T` (or a plain `T[]` when `N` is a
 * general `number`).
 */
export type Tuple<T, N extends number> = N extends N
    ? number extends N
        ? T[]
        : _TupleOf<T, N, []>
    : never;
/** Recursive builder for {@link Tuple}: prepends `T` until `R` has `N` elements. */
export type _TupleOf<
    T,
    N extends number,
    R extends unknown[],
> = R["length"] extends N ? R : _TupleOf<T, N, [T, ...R]>;

/** `T` with all `readonly` modifiers removed. */
export type Writable<T> = { -readonly [P in keyof T]: T[P] };

export type WrapUnionMembers<T> = T extends unknown ? [T] : never;
export type CombinationTupleMembers<T> = T extends []
    ? T
    : T extends [infer F, ...infer R]
      ? [...WrapUnionMembers<F>, ...CombinationTupleMembers<R>]
      : never;
export type NoDuplicateElements<T> = T extends []
    ? []
    : T extends [infer F, ...infer R]
      ? F extends R[number]
          ? never
          : [F, ...NoDuplicateElements<R>]
      : never;
export type UnionPermutations<U, L extends number> = NoDuplicateElements<
    CombinationTupleMembers<Tuple<U, L>>
>;

/** A tuple/array type with its first element removed. */
export type DropFirst<T extends any[]> = T extends [any, ...infer Rest]
    ? Rest
    : [];

/**
 * A variable name: either a string, or a symbol (as produced by {@link gensym}).
 *
 * Note that when `Identifier`s are used as object keys, you should use
 * `Reflect.ownKeys()` instead of `Object.keys()` since the latter only returns
 * the string properties and skips symbols.
 */
export type Identifier = string | symbol;
/** Type guard for {@link Identifier}. */
export const isIdentifier = (x: unknown): x is Identifier =>
    isString(x) || typeof x === "symbol";

/**
 * Like `Object.entries(x)` but includes own symbol properties as well (it uses
 * `Reflect.ownKeys()`)
 */
export const objectEntries = <T>(x: Record<Identifier, T>): [Identifier, T][] =>
    Reflect.ownKeys(x).map((k) => [k, x[k]!]);

/**
 * Like `Object.values(x)` but includes values of own symbol properties as well
 * (it uses `Reflect.ownKeys()`)
 */
export const objectValues = <T>(x: Record<Identifier, T>): T[] =>
    Reflect.ownKeys(x).map((k) => x[k]!);
