interface Documented {
    description: string;
    examples: Example[];
    category: string;
}
interface Named {
    name: string;
}
export interface Example {
    code: string;
    lang: string;
}
export interface ModuleDoc {
    functions: FunctionDoc[];
    syntax: SyntaxDoc[];
    values: ValueDoc[];
}
export interface FunctionDoc extends Documented, Named {
    params: ParamDoc[];
    returns: string | undefined;
    returnType: string | undefined;
}
export interface SyntaxDoc extends Documented, Named {
    shapes: string[];
}
export interface ValueDoc extends Documented, Named {
    type: string | undefined;
}
export interface ParamDoc extends Named {
    description: string;
    type: string | undefined;
    lazy: boolean;
    rest: boolean;
}

export type Documentation = Record<string, ModuleDoc>;
