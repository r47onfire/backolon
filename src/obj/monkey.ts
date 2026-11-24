import { isArray } from "lib0/array";
import { abs, max } from "lib0/math";
import { BTypeError, BValueError, DivideByZeroError } from "../errors/classes";
import { callValue } from "../runtime/call";
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
    NotImplemented,
    ReflectedMathable,
    Stringable,
} from "./protocol";

declare global {
    interface Number
        extends ReflectedMathable, Negateable, Absable, Comparable {}
    interface BigInt
        extends ReflectedMathable, Negateable, Absable, Comparable {}
    /** Bool is treated as an int subclass */
    interface Boolean extends Number {}
    interface String extends Comparable {
        __add__: Callable<typeof ONE_ARG_SIG, string | typeof NotImplemented>;
        __mul__: Callable<typeof ONE_ARG_SIG, string | typeof NotImplemented>;
        __rmul__: Callable<typeof ONE_ARG_SIG, string | typeof NotImplemented>;
    }
    interface Array<T> {
        __add__: Callable<typeof ONE_ARG_SIG, any[] | typeof NotImplemented>;
        __mul__: Callable<typeof ONE_ARG_SIG, any[] | typeof NotImplemented>;
        __rmul__: Callable<typeof ONE_ARG_SIG, any[] | typeof NotImplemented>;
        __eq__: Callable<typeof ONE_ARG_SIG, boolean | typeof NotImplemented>;
        __ne__: Callable<typeof ONE_ARG_SIG, boolean | typeof NotImplemented>;
    }
    // object implements only the default identity __eq__/__ne__
    // and the default __str__
    interface Object extends Comparable, Stringable {}

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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
                        "backolon.operator.divide_by_zero",
                        [this],
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
    return NotImplemented;
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
                        "backolon.operator.divide_by_zero",
                        [this],
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
                    "backolon.operator.divide_by_zero",
                    [this],
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
                        "backolon.operator.divide_by_zero",
                        [this],
                    ),
                );
            }
            return this / BigInt(other);
        }
        return Number(this) / other;
    }
    return NotImplemented;
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
                    "backolon.operator.divide_by_zero",
                    [other],
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
                        "backolon.operator.divide_by_zero",
                        [other],
                    ),
                );
            }
            return BigInt(other) / this;
        }
        return other / Number(this);
    }
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
    return NotImplemented;
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
        if (eq === NotImplemented) return NotImplemented;
        if (!eq) return false;
    }
    return true;
}, ONE_ARG_SIG);

const objectMethod = (method: string, f: Builtin<any>) =>
    Reflect.defineProperty(Object.prototype, method, {
        value: f,
        writable: true,
        configurable: true,
    });
// the default equality every value inherits: identity. these two are
// non-enumerable (unlike the assignments above) because an enumerable
// property on Object.prototype would leak into every for-in loop in the
// host
objectMethod(
    "__eq__",
    new Builtin(function* (
        this: unknown,
        task,
        env,
        traceback,
        handlers,
        other,
    ) {
        return this === other;
    }, ONE_ARG_SIG),
);

// By default, if an object defined __eq__ but not __ne__ it ends up here.
objectMethod(
    "__ne__",
    new Builtin(function* (this: any, task, env, traceback, handlers, other) {
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
);

// The default string form of a value: the host's own conversion. Every
// value inherits it, so anything at all can be interpolated into a string;
// a type that wants a different form overrides it. Non-enumerable, like
// __eq__/__ne__ above.
objectMethod(
    "__str__",
    new Builtin(function* (this: unknown) {
        return String(this);
    }, NO_ARGS_SIG),
);

Function.prototype.__call__ = new Builtin(function* (
    this: Function,
    task,
    env,
    traceback,
    handlers,
    args,
) {
    task.vm.emit("call_js_function", [this, args]);
    return this(...args);
}, ARGUMENTS_SIG);

Function.prototype.__signature__ = new Builtin(
    () => ARGUMENTS_SIG,
    NO_ARGS_SIG,
);
