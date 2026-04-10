interface Documented {
    name: string;
    description: string;
    examples: Example[];
    category: string;
}
interface Example {
    code: string;
    lang: string;
}
interface ModuleDoc extends Documented {
    functions: FunctionDoc[];
    syntax: SyntaxDoc[];
    values: ValueDoc[];
}
interface FunctionDoc extends Documented {
    params: ParamDoc[];
    returns: string;
    returnType: string;
}
interface SyntaxDoc extends Documented {
    shape: string;
}
interface ValueDoc extends Documented {
    type: string;
}
interface ParamDoc extends Documented {
    type: string;
    lazy: boolean;
}

export type Documentation = Record<string, ModuleDoc>;
