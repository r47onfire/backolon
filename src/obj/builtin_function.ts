import { Callable } from "./protocol";

export class Builtin<
    P extends any[] = unknown[],
    R = unknown,
> implements Callable<P, R> {}
