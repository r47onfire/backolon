import { CSTNode } from "@r47onfire/nebula";
import { isArray } from "lib0/array";
import { abs, max } from "lib0/math";
import { BTypeError, BValueError } from "../errors/classes";
import { Task, TaskGen } from "../runtime";
import {
    Absable,
    Callable,
    CallableOrDirectFunc,
    Comparable,
    Negateable,
    ReflectedMathable,
} from "./protocol";

declare global {
    interface Number
        extends ReflectedMathable, Negateable, Absable, Comparable {}
    interface BigInt
        extends ReflectedMathable, Negateable, Absable, Comparable {}
    /** Bool is treated as an int subclass */
    interface Boolean extends Number {}
    interface String extends Comparable {
        __add__: CallableOrDirectFunc<[other: any], string>;
        __mul__: CallableOrDirectFunc<[other: any], string>;
        __rmul__: CallableOrDirectFunc<[other: any], string>;
    }
    interface Array<T> {
        __add__(task: Task, other: any): TaskGen<any[]>;
        __mul__(task: Task, other: any): TaskGen<any[]>;
        __rmul__(task: Task, other: any): TaskGen<any[]>;
        __eq__(task: Task, other: any): TaskGen<boolean>;
        __ne__(task: Task, other: any): TaskGen<boolean>;
    }
    // object implements only the default identity __eq__/__ne__
    interface Object extends Comparable {}

    interface Function extends Callable {}
}

Number.prototype.__add__ = function* (
    this: number,
    task: Task,
    other: unknown,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "bigint") {
        if (Number.isInteger(Number(this))) {
            return BigInt(this) + other;
        }
        return this + Number(other);
    }
    if (typeof other === "number") {
        return this + other;
    }
    throw new BTypeError("backolon.math.wrongtype.add.number", other);
};

// addition is commutative, conversions included
Number.prototype.__radd__ = Number.prototype.__add__;

Number.prototype.__sub__ = function* (
    this: number,
    task: Task,
    other: unknown,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "bigint") {
        if (Number.isInteger(Number(this))) {
            return BigInt(this) - other;
        }
        return this - Number(other);
    }
    if (typeof other === "number") {
        return this - other;
    }
    throw new BTypeError("backolon.math.wrongtype.sub.number", other);
};

Number.prototype.__rsub__ = function* (
    this: number,
    task: Task,
    other: unknown,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "bigint") {
        if (Number.isInteger(Number(this))) {
            return other - BigInt(this);
        }
        return Number(other) - this;
    }
    if (typeof other === "number") {
        return other - this;
    }
    throw new BTypeError("backolon.math.wrongtype.sub.number", other);
};

Number.prototype.__mul__ = function* (
    this: number,
    task: Task,
    other: unknown,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "bigint") {
        if (Number.isInteger(Number(this))) {
            return BigInt(this) * other;
        }
        return this * Number(other);
    }
    if (typeof other === "number") {
        return this * other;
    }
    throw new BTypeError("backolon.math.wrongtype.mul.number", other);
};

// multiplication is commutative, conversions included
Number.prototype.__rmul__ = Number.prototype.__mul__;

Number.prototype.__div__ = function* (
    this: number,
    task: Task,
    other: unknown,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "bigint") {
        if (Number.isInteger(Number(this))) {
            if (other === 0n) {
                throw new BValueError(
                    "backolon.math.undefined.div_zero.bigint",
                    other,
                );
            }
            return BigInt(this) / other;
        }
        return this / Number(other);
    }
    if (typeof other === "number") {
        return this / other;
    }
    throw new BTypeError("backolon.math.wrongtype.div.number", other);
};

Number.prototype.__rdiv__ = function* (
    this: number,
    task: Task,
    other: unknown,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "bigint") {
        if (Number.isInteger(Number(this))) {
            if (this === 0) {
                throw new BValueError(
                    "backolon.math.undefined.div_zero.bigint",
                    this,
                );
            }
            return other / BigInt(this);
        }
        return Number(other) / this;
    }
    if (typeof other === "number") {
        return other / this;
    }
    throw new BTypeError("backolon.math.wrongtype.div.number", other);
};

Number.prototype.__neg__ = function* (this: number, task: Task) {
    return -this;
};

Number.prototype.__abs__ = function* (this: number, task: Task) {
    return abs(this);
};

// Ah, if only Javascript had preprocessor macros.

Number.prototype.__lt__ = function* (this: number, task: Task, other: unknown) {
    // booleans compare as 0/1: bool is an int subclass
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this < other;
    }
    throw new BTypeError("backolon.compare.number.lt", other);
};

Number.prototype.__gt__ = function* (this: number, task: Task, other: unknown) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this > other;
    }
    throw new BTypeError("backolon.compare.number.gt", other);
};

Number.prototype.__lte__ = function* (
    this: number,
    task: Task,
    other: unknown,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this <= other;
    }
    throw new BTypeError("backolon.compare.number.lte", other);
};

Number.prototype.__gte__ = function* (
    this: number,
    task: Task,
    other: unknown,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this >= other;
    }
    throw new BTypeError("backolon.compare.number.gte", other);
};

Number.prototype.__eq__ = function* (this: number, task: Task, other: unknown) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number") {
        return Number(this) === other;
    }
    if (typeof other === "bigint") {
        return Number.isInteger(Number(this)) && BigInt(this) === other;
    }
    return false;
};

Number.prototype.__ne__ = function* (this: number, task: Task, other: unknown) {
    return !(yield* Reflect.apply(Number.prototype.__eq__!, this, [
        task,
        other,
    ]));
};

BigInt.prototype.__add__ = function* (
    this: bigint,
    task: Task,
    other: unknown,
) {
    if (typeof other === "bigint") {
        return this + other;
    }
    if (typeof other === "number") {
        if (Number.isInteger(other)) {
            return this + BigInt(other);
        }
        return Number(this) + other;
    }
    throw new BTypeError("backolon.math.wrongtype.add.bigint", other);
};

// addition is commutative, conversions included
BigInt.prototype.__radd__ = BigInt.prototype.__add__;

BigInt.prototype.__sub__ = function* (
    this: bigint,
    task: Task,
    other: unknown,
) {
    if (typeof other === "bigint") {
        return this - other;
    }
    if (typeof other === "number") {
        if (Number.isInteger(other)) {
            return this - BigInt(other);
        }
        return Number(this) - other;
    }
    throw new BTypeError("backolon.math.wrongtype.sub.bigint", other);
};

BigInt.prototype.__rsub__ = function* (
    this: bigint,
    task: Task,
    other: unknown,
) {
    if (typeof other === "bigint") {
        return other - this;
    }
    if (typeof other === "number") {
        if (Number.isInteger(other)) {
            return BigInt(other) - this;
        }
        return other - Number(this);
    }
    throw new BTypeError("backolon.math.wrongtype.sub.bigint", other);
};

BigInt.prototype.__mul__ = function* (
    this: bigint,
    task: Task,
    other: unknown,
) {
    if (typeof other === "bigint") {
        return this * other;
    }
    if (typeof other === "number") {
        if (Number.isInteger(other)) {
            return this * BigInt(other);
        }
        return Number(this) * other;
    }
    throw new BTypeError("backolon.math.wrongtype.mul.bigint", other);
};

// multiplication is commutative, conversions included
BigInt.prototype.__rmul__ = BigInt.prototype.__mul__;

BigInt.prototype.__div__ = function* (
    this: bigint,
    task: Task,
    other: unknown,
) {
    if (typeof other === "bigint") {
        if (other === 0n) {
            throw new BValueError(
                "backolon.math.undefined.div_zero.bigint",
                other,
            );
        }
        return this / other;
    }
    if (typeof other === "number") {
        if (Number.isInteger(other)) {
            if (other === 0) {
                throw new BValueError(
                    "backolon.math.undefined.div_zero.bigint",
                    other,
                );
            }
            return this / BigInt(other);
        }
        return Number(this) / other;
    }
    throw new BTypeError("backolon.math.wrongtype.div.bigint", other);
};

BigInt.prototype.__rdiv__ = function* (
    this: bigint,
    task: Task,
    other: unknown,
) {
    if (typeof other === "bigint") {
        if (this === 0n) {
            throw new BValueError(
                "backolon.math.undefined.div_zero.bigint",
                this,
            );
        }
        return other / this;
    }
    if (typeof other === "number") {
        if (Number.isInteger(other)) {
            if (this === 0n) {
                throw new BValueError(
                    "backolon.math.undefined.div_zero.bigint",
                    this,
                );
            }
            return BigInt(other) / this;
        }
        return other / Number(this);
    }
    throw new BTypeError("backolon.math.wrongtype.div.bigint", other);
};

BigInt.prototype.__neg__ = function* (this: bigint, task: Task) {
    return -this;
};

BigInt.prototype.__abs__ = function* (this: bigint, task: Task) {
    return this < 0n ? -this : this;
};

BigInt.prototype.__lt__ = function* (this: bigint, task: Task, other: unknown) {
    // booleans compare as 0/1: bool is an int subclass
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this < other;
    }
    throw new BTypeError("backolon.compare.bigint.lt", other);
};

BigInt.prototype.__gt__ = function* (this: bigint, task: Task, other: unknown) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this > other;
    }
    throw new BTypeError("backolon.compare.bigint.gt", other);
};

BigInt.prototype.__lte__ = function* (
    this: bigint,
    task: Task,
    other: unknown,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this <= other;
    }
    throw new BTypeError("backolon.compare.bigint.lte", other);
};

BigInt.prototype.__gte__ = function* (
    this: bigint,
    task: Task,
    other: unknown,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this >= other;
    }
    throw new BTypeError("backolon.compare.bigint.gte", other);
};

BigInt.prototype.__eq__ = function* (this: bigint, task: Task, other: unknown) {
    if (typeof other === "boolean") return this === BigInt(other);
    if (typeof other === "bigint") {
        return this === other;
    }
    if (typeof other === "number") {
        return Number.isInteger(other) && this === BigInt(other);
    }
    return false;
};

BigInt.prototype.__ne__ = function* (this: bigint, task: Task, other: unknown) {
    return !(yield* Reflect.apply(BigInt.prototype.__eq__!, this, [
        task,
        other,
    ]));
};

// booleans are 0/1 in numeric contexts (bool is an int subclass), so
// every numeric method delegates to Number's with the value converted
Object.setPrototypeOf(Boolean.prototype, Number.prototype);

String.prototype.__add__ = function* (
    this: string,
    task: Task,
    other: unknown,
) {
    if (typeof other === "string") {
        return this + other;
    }
    throw new BTypeError("backolon.math.string.add", other);
};

// the repetition count for __mul__ on sequences: a nonnegative integer
// (a negative count repeats zero times), as a JS number
const repeatCount = (other: unknown): number | undefined => {
    if (typeof other === "number" && Number.isInteger(other)) {
        return max(0, other);
    }
    if (
        typeof other === "bigint" &&
        other >= 0n &&
        other <= BigInt(Number.MAX_SAFE_INTEGER)
    ) {
        return Number(other);
    }
    return undefined;
};

String.prototype.__mul__ = function* (
    this: string,
    task: Task,
    other: unknown,
) {
    const count = repeatCount(other);
    if (count !== undefined) {
        return this.repeat(count);
    }
    throw new BTypeError("backolon.math.string.mul", other);
};

// the count is the other operand either way around
String.prototype.__rmul__ = String.prototype.__mul__;

String.prototype.__lt__ = function* (this: string, task: Task, other: unknown) {
    if (typeof other === "string") {
        return this < other;
    }
    throw new BTypeError("backolon.compare.string.lt", other);
};

String.prototype.__gt__ = function* (this: string, task: Task, other: unknown) {
    if (typeof other === "string") {
        return this > other;
    }
    throw new BTypeError("backolon.compare.string.gt", other);
};

String.prototype.__lte__ = function* (
    this: string,
    task: Task,
    other: unknown,
) {
    if (typeof other === "string") {
        return this <= other;
    }
    throw new BTypeError("backolon.compare.string.lte", other);
};

String.prototype.__gte__ = function* (
    this: string,
    task: Task,
    other: unknown,
) {
    if (typeof other === "string") {
        return this >= other;
    }
    throw new BTypeError("backolon.compare.string.gte", other);
};

String.prototype.__eq__ = function* (this: string, task: Task, other: unknown) {
    return typeof other === "string" && this === other;
};

String.prototype.__ne__ = function* (this: string, task: Task, other: unknown) {
    return !(yield* Reflect.apply(String.prototype.__eq__!, this, [
        task,
        other,
    ]));
};

Array.prototype.__add__ = function* (
    this: unknown[],
    task: Task,
    other: unknown,
) {
    if (isArray(other)) {
        return [...this, ...other];
    }
    throw new BTypeError("backolon.math.array.add", other);
};

Array.prototype.__mul__ = function* (
    this: unknown[],
    task: Task,
    other: unknown,
) {
    const count = repeatCount(other);
    if (count !== undefined) {
        const out: unknown[] = [];
        for (let n = 0; n < count; n++) out.push(...this);
        return out;
    }
    throw new BTypeError("backolon.math.array.mul", other);
};

// the count is the other operand either way around
Array.prototype.__rmul__ = Array.prototype.__mul__;

Array.prototype.__eq__ = function* (
    this: unknown[],
    task: Task,
    other: unknown,
) {
    if (!isArray(other) || other.length !== this.length) {
        return false;
    }
    for (let n = 0; n < this.length; n++) {
        const a = this[n] as Comparable;
        const b: unknown = other[n];
        const eq =
            typeof a?.__eq__ === "function"
                ? yield* a.__eq__(task, b)
                : a === b;
        if (!eq) return false;
    }
    return true;
};

// the default equality every value inherits: identity. these two are
// non-enumerable (unlike the assignments above) because an enumerable
// property on Object.prototype would leak into every for-in loop in the
// host
Object.defineProperty(Object.prototype, "__eq__", {
    value: function* (this: unknown, task: Task, other: unknown) {
        return this === other;
    },
    writable: true,
    configurable: true,
});

Object.defineProperty(Object.prototype, "__ne__", {
    value: function* (this: unknown, task: Task, other: unknown) {
        return !(yield* Reflect.apply(Object.prototype.__eq__!, this, [
            task,
            other,
        ]));
    },
    writable: true,
    configurable: true,
});

Function.prototype.__call__ = function* (
    this: Function,
    task: Task,
    arg: CSTNode<any>,
) {
    // TODO: what to do here
};
