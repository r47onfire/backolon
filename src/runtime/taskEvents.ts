import { BaseBackolonError } from "../errors";
import type { Task } from "./vm";
/** Map of the lifecycle events that a {@link Task} can emit. */
export interface TaskEvents {
    [x: string]: unknown;
    // potentially unsafe things
    finish: any;
    error: BaseBackolonError;
}
