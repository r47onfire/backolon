import { Callable } from "../../obj/monkey";

export class Builtin<
    P extends any[] = unknown[],
    R = unknown,
> implements Callable<P, R> {}
