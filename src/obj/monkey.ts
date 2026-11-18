import { isArray } from "lib0/array";
import { abs, max } from "lib0/math";
import { BTypeError, BValueError, DivideByZeroError } from "../errors/classes";
import { callValue } from "../runtime";
import { handleError } from "../runtime/trycatch";
import {
    ARGUMENTS_SIG,
    Builtin,
    NO_ARGS_SIG,
    ONE_ARG_SIG,
} from "./builtin_function";
import {
    Absable,
    Callable,
    CallableObject,
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
        __add__: Callable<typeof ONE_ARG_SIG, string>;
        __mul__: Callable<typeof ONE_ARG_SIG, string>;
        __rmul__: Callable<typeof ONE_ARG_SIG, string>;
    }
    interface Array<T> {
        __add__: Callable<typeof ONE_ARG_SIG, any[]>;
        __mul__: Callable<typeof ONE_ARG_SIG, any[]>;
        __rmul__: Callable<typeof ONE_ARG_SIG, any[]>;
        __eq__: Callable<typeof ONE_ARG_SIG, boolean>;
        __ne__: Callable<typeof ONE_ARG_SIG, boolean>;
    }
    // object implements only the default identity __eq__/__ne__
    interface Object extends Comparable {}

    interface Function extends CallableObject<typeof ARGUMENTS_SIG, unknown> {}
}

Number.prototype.__add__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
    other,
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
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.add.number", other),
    );
}, ONE_ARG_SIG);

// addition is commutative, conversions included
Number.prototype.__radd__ = Number.prototype.__add__;

Number.prototype.__sub__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
    other,
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
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.sub.number", other),
    );
}, ONE_ARG_SIG);

Number.prototype.__rsub__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
    other,
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
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.sub.number", other),
    );
}, ONE_ARG_SIG);

Number.prototype.__mul__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
    other,
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
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.mul.number", other),
    );
}, ONE_ARG_SIG);

// multiplication is commutative, conversions included
Number.prototype.__rmul__ = Number.prototype.__mul__;

Number.prototype.__div__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "bigint") {
        if (Number.isInteger(Number(this))) {
            if (other === 0n) {
                return yield* handleError(
                    task,
                    env,
                    traceback,
                    handlers,
                    new DivideByZeroError(
                        "backolon.math.undefined.div_zero.bigint",
                        other,
                    ),
                );
            }
            return BigInt(this) / other;
        }
        return this / Number(other);
    }
    if (typeof other === "number") {
        return this / other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.div.number", other),
    );
}, ONE_ARG_SIG);

Number.prototype.__rdiv__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "bigint") {
        if (Number.isInteger(Number(this))) {
            if (this === 0) {
                return yield* handleError(
                    task,
                    env,
                    traceback,
                    handlers,
                    new DivideByZeroError(
                        "backolon.math.undefined.div_zero.bigint",
                        this,
                    ),
                );
            }
            return other / BigInt(this);
        }
        return Number(other) / this;
    }
    if (typeof other === "number") {
        return other / this;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.div.number", other),
    );
}, ONE_ARG_SIG);

Number.prototype.__neg__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
) {
    return -this;
}, NO_ARGS_SIG);

Number.prototype.__abs__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
) {
    return abs(this);
}, NO_ARGS_SIG);

// Ah, if only Javascript had preprocessor macros.

Number.prototype.__lt__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    // booleans compare as 0/1: bool is an int subclass
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this < other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.number.lt", other),
    );
}, ONE_ARG_SIG);

Number.prototype.__gt__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this > other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.number.gt", other),
    );
}, ONE_ARG_SIG);

Number.prototype.__lte__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this <= other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.number.lte", other),
    );
}, ONE_ARG_SIG);

Number.prototype.__gte__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this >= other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.number.gte", other),
    );
}, ONE_ARG_SIG);

Number.prototype.__eq__ = new Builtin(function* (
    this: number,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number") {
        return Number(this) === other;
    }
    if (typeof other === "bigint") {
        return Number.isInteger(Number(this)) && BigInt(this) === other;
    }
    return false;
}, ONE_ARG_SIG);

BigInt.prototype.__add__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
    other,
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
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.add.bigint", other),
    );
}, ONE_ARG_SIG);

// addition is commutative, conversions included
BigInt.prototype.__radd__ = BigInt.prototype.__add__;

BigInt.prototype.__sub__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
    other,
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
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.sub.bigint", other),
    );
}, ONE_ARG_SIG);

BigInt.prototype.__rsub__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
    other,
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
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.sub.bigint", other),
    );
}, ONE_ARG_SIG);

BigInt.prototype.__mul__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
    other,
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
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.mul.bigint", other),
    );
}, ONE_ARG_SIG);

// multiplication is commutative, conversions included
BigInt.prototype.__rmul__ = BigInt.prototype.__mul__;

BigInt.prototype.__div__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "bigint") {
        if (other === 0n) {
            return yield* handleError(
                task,
                env,
                traceback,
                handlers,
                new BValueError(
                    "backolon.math.undefined.div_zero.bigint",
                    other,
                ),
            );
        }
        return this / other;
    }
    if (typeof other === "number") {
        if (Number.isInteger(other)) {
            if (other === 0) {
                return yield* handleError(
                    task,
                    env,
                    traceback,
                    handlers,
                    new BValueError(
                        "backolon.math.undefined.div_zero.bigint",
                        other,
                    ),
                );
            }
            return this / BigInt(other);
        }
        return Number(this) / other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.div.bigint", other),
    );
}, ONE_ARG_SIG);

BigInt.prototype.__rdiv__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "bigint") {
        if (this === 0n) {
            return yield* handleError(
                task,
                env,
                traceback,
                handlers,
                new BValueError(
                    "backolon.math.undefined.div_zero.bigint",
                    this,
                ),
            );
        }
        return other / this;
    }
    if (typeof other === "number") {
        if (Number.isInteger(other)) {
            if (this === 0n) {
                return yield* handleError(
                    task,
                    env,
                    traceback,
                    handlers,
                    new BValueError(
                        "backolon.math.undefined.div_zero.bigint",
                        this,
                    ),
                );
            }
            return BigInt(other) / this;
        }
        return other / Number(this);
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.wrongtype.div.bigint", other),
    );
}, ONE_ARG_SIG);

BigInt.prototype.__neg__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
) {
    return -this;
}, NO_ARGS_SIG);

BigInt.prototype.__abs__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
) {
    return this < 0n ? -this : this;
}, NO_ARGS_SIG);

BigInt.prototype.__lt__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    // booleans compare as 0/1: bool is an int subclass
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this < other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.bigint.lt", other),
    );
}, ONE_ARG_SIG);

BigInt.prototype.__gt__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this > other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.bigint.gt", other),
    );
}, ONE_ARG_SIG);

BigInt.prototype.__lte__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this <= other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.bigint.lte", other),
    );
}, ONE_ARG_SIG);

BigInt.prototype.__gte__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "boolean") other = Number(other);
    if (typeof other === "number" || typeof other === "bigint") {
        return this >= other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.bigint.gte", other),
    );
}, ONE_ARG_SIG);

BigInt.prototype.__eq__ = new Builtin(function* (
    this: bigint,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "boolean") return this === BigInt(other);
    if (typeof other === "bigint") {
        return this === other;
    }
    if (typeof other === "number") {
        return Number.isInteger(other) && this === BigInt(other);
    }
    return false;
}, ONE_ARG_SIG);

// booleans are 0/1 in numeric contexts (bool is an int subclass), so
// every numeric method delegates to Number's with the value converted
Object.setPrototypeOf(Boolean.prototype, Number.prototype);

String.prototype.__add__ = new Builtin(function* (
    this: string,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "string") {
        return this + other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.string.add", other),
    );
}, ONE_ARG_SIG);

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

String.prototype.__mul__ = new Builtin(function* (
    this: string,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    const count = repeatCount(other);
    if (count !== undefined) {
        return this.repeat(count);
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.string.mul", other),
    );
}, ONE_ARG_SIG);

// the count is the other operand either way around
String.prototype.__rmul__ = String.prototype.__mul__;

String.prototype.__lt__ = new Builtin(function* (
    this: string,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "string") {
        return this < other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.string.lt", other),
    );
}, ONE_ARG_SIG);

String.prototype.__gt__ = new Builtin(function* (
    this: string,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "string") {
        return this > other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.string.gt", other),
    );
}, ONE_ARG_SIG);

String.prototype.__lte__ = new Builtin(function* (
    this: string,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "string") {
        return this <= other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.string.lte", other),
    );
}, ONE_ARG_SIG);

String.prototype.__gte__ = new Builtin(function* (
    this: string,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (typeof other === "string") {
        return this >= other;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.compare.string.gte", other),
    );
}, ONE_ARG_SIG);

String.prototype.__eq__ = new Builtin(function* (
    this: string,
    task,
    env,
    traceback,
    handlers,
    other,
) {
    return typeof other === "string" && this === other;
}, ONE_ARG_SIG);

Array.prototype.__add__ = new Builtin(function* (
    this: unknown[],
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (isArray(other)) {
        return [...this, ...other];
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.array.add", other),
    );
}, ONE_ARG_SIG);

Array.prototype.__mul__ = new Builtin(function* (
    this: unknown[],
    task,
    env,
    traceback,
    handlers,
    other,
) {
    const count = repeatCount(other);
    if (count !== undefined) {
        const out: unknown[] = [];
        for (let n = 0; n < count; n++) out.push(...this);
        return out;
    }
    return yield* handleError(
        task,
        env,
        traceback,
        handlers,
        new BTypeError("backolon.math.array.mul", other),
    );
}, ONE_ARG_SIG);

// the count is the other operand either way around
Array.prototype.__rmul__ = Array.prototype.__mul__;

Array.prototype.__eq__ = new Builtin(function* (
    this: unknown[],
    task,
    env,
    traceback,
    handlers,
    other,
) {
    if (!isArray(other) || other.length !== this.length) {
        return false;
    }
    for (let n = 0; n < this.length; n++) {
        const a = this[n] as Comparable;
        const b: unknown = other[n];
        const eq =
            a?.__eq__ !== undefined
                ? yield* callValue(
                      task,
                      env,
                      traceback,
                      handlers,
                      a.__eq__,
                      a,
                      [b],
                      true,
                  )
                : a === b;
        if (!eq) return false;
    }
    return true;
}, ONE_ARG_SIG);

// the default equality every value inherits: identity. these two are
// non-enumerable (unlike the assignments above) because an enumerable
// property on Object.prototype would leak into every for-in loop in the
// host
Object.defineProperty(Object.prototype, "__eq__", {
    value: new Builtin(function* (
        this: unknown,
        task,
        env,
        traceback,
        handlers,
        other,
    ) {
        return this === other;
    }, ONE_ARG_SIG),
    writable: true,
    configurable: true,
});

// By default, if an object defined __eq__ but not __ne__ it ends up here.
Object.defineProperty(Object.prototype, "__ne__", {
    value: new Builtin(function* (
        this: any,
        task,
        env,
        traceback,
        handlers,
        other,
    ) {
        return !(yield* callValue(
            task,
            env,
            traceback,
            handlers,
            this.__eq__,
            this,
            [other],
            true,
        ));
    }, ONE_ARG_SIG),
    writable: true,
    configurable: true,
});

Function.prototype.__call__ = new Builtin(function* (this: Function, task, env, traceback, handlers, args) {
    task.vm.emit("call_js_function", [this, args]);
    return this(...args);
}, ARGUMENTS_SIG);

Function.prototype.__signature__ = new Builtin(
    () => ARGUMENTS_SIG,
    NO_ARGS_SIG,
);
