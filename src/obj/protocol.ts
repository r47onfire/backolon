import { LinkedList } from "@r47onfire/game-math";
import { Env, Task, TaskGen } from "../runtime";
import { StackTreeNode } from "../errors/compress";
import { TryCatchHandler } from "../runtime/trycatch";

export type CallableOrDirectFunc<P extends any[] = unknown[], R = unknown> =
    | ((
          task: Task,
          env: Env,
          traceback: LinkedList<StackTreeNode>,
          handlers: LinkedList<TryCatchHandler>,
          wrappers: LinkedList<abstract new (...args: any[]) => any>,
          ...args: P
      ) => TaskGen<R>)
    | Callable<P, R>;

export interface Callable<P extends any[] = unknown[], R = unknown> {
    __call__: CallableOrDirectFunc<P, R>;
    __signature__: CallableOrDirectFunc<[], Signature<P>>;
}

export interface Mathable {
    __add__: CallableOrDirectFunc<[other: any], any>;
    __sub__: CallableOrDirectFunc<[other: any], any>;
    __mul__: CallableOrDirectFunc<[other: any], any>;
    __div__: CallableOrDirectFunc<[other: any], any>;
    __matmul__?: CallableOrDirectFunc<[other: any], any>;
    __rmatmul__?: CallableOrDirectFunc<[other: any], any>;
}
export interface Negateable {
    __neg__: CallableOrDirectFunc<[], any>;
}
export interface Absable {
    __abs__: CallableOrDirectFunc<[], any>;
}

export interface ReflectedMathable extends Mathable {
    __radd__: CallableOrDirectFunc<[other: any], any>;
    __rsub__: CallableOrDirectFunc<[other: any], any>;
    __rmul__: CallableOrDirectFunc<[other: any], any>;
    __rdiv__: CallableOrDirectFunc<[other: any], any>;
}

export interface Comparable {
    __lt__?: CallableOrDirectFunc<[other: any], boolean>;
    __gt__?: CallableOrDirectFunc<[other: any], boolean>;
    __lte__?: CallableOrDirectFunc<[other: any], boolean>;
    __gte__?: CallableOrDirectFunc<[other: any], boolean>;
    __eq__?: CallableOrDirectFunc<[other: any], boolean>;
    __ne__?: CallableOrDirectFunc<[other: any], boolean>;
}
