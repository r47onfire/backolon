import { CSTNode } from "@r47onfire/nebula";
import { BaseBackolonError } from "../errors";

export interface TryCatchHandler {
    /** Used for `instanceof` testing to run the handler. */
    cls: abstract new (...args: unknown[]) => BaseBackolonError;
    handler: CSTNode<any>;
}
