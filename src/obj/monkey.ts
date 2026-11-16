import { CSTNode } from "@r47onfire/nebula";
import { BTypeError } from "../errors/classes";
import { Task, TaskGen } from "../runtime";

export interface Mathable {
    __add__(task: Task, other: any): TaskGen<any>;
    __radd__?(task: Task, other: any): TaskGen<any>;
    __sub__(task: Task, other: any): TaskGen<any>;
    __rsub__?(task: Task, other: any): TaskGen<any>;
    __mul__(task: Task, other: any): TaskGen<any>;
    __rmul__?(task: Task, other: any): TaskGen<any>;
    __div__(task: Task, other: any): TaskGen<any>;
    __rdiv__?(task: Task, other: any): TaskGen<any>;
    __matmul__?(task: Task, other: any): TaskGen<any>;
    __rmatmul__?(task: Task, other: any): TaskGen<any>;
    __neg__?(task: Task): TaskGen<any>;
    __abs__?(task: Task): TaskGen<any>;
}

export interface Comparable {
    __lt__?(task: Task, other: any): TaskGen<any>;
    __gt__?(task: Task, other: any): TaskGen<any>;
    __lte__?(task: Task, other: any): TaskGen<any>;
    __gte__?(task: Task, other: any): TaskGen<any>;
    __eq__?(task: Task, other: any): TaskGen<any>;
    __ne__?(task: Task, other: any): TaskGen<any>;
}

export interface Callable {
    __call__(task: Task, arg: CSTNode<any>): TaskGen<any>;
    __signature__(task: Task): TaskGen<Signature>;
}

declare global {
    interface Number extends Mathable, Comparable {}
    interface BigInt extends Mathable, Comparable {}

    interface Function extends Callable {}
}

Number.prototype.__add__ = function* (
    this: number,
    task: Task,
    other: unknown,
) {
    if (typeof other === "bigint") {
        if (Number.isInteger(this)) {
            return BigInt(this) + other;
        }
        return this + Number(other);
    }
    if (typeof other === "number") {
        return this + other;
    }
    throw new BTypeError("backolon.math.number.add", other);
};

Function.prototype.__call__ = function* (
    this: Function,
    task: Task,
    arg: CSTNode<any>,
) {
    // TODO: what to do here
};
