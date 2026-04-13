interface Documented {
    description: string;
    examples: Example[];
    category: string;
}
interface Named {
    name: string;
}
interface Example {
    code: string;
    lang: string;
}
interface ModuleDoc {
    functions: FunctionDoc[];
    syntax: SyntaxDoc[];
    values: ValueDoc[];
}
interface FunctionDoc extends Documented, Named {
    params: ParamDoc[];
    returns: string | undefined;
    returnType: string | undefined;
}
interface SyntaxDoc extends Documented {
    shape: string;
}
interface ValueDoc extends Documented, Named {
    type: string | undefined;
}
interface ParamDoc extends Named {
    description: string;
    type: string | undefined;
    lazy: boolean;
    rest: boolean;
}

export type Documentation = Record<string, ModuleDoc>;
