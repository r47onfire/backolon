import { Thing, ThingType } from "../objects/thing";
declare module "*.bk" {
    export const ast: Thing<ThingType.topblock>;
    export const source: string;
    export default ast;
}
