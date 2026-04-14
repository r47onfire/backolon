import markdown from "markdown-it";
import { Reflection } from "typedoc";
import { Tags, contentToText } from "./comment-utils";
import type { Documentation } from "./doc";

const md = new markdown();

function parseExample(string: string) {
    const match = /(```|~~~)(.+?)\n([\s\S]+)\1/.exec(string)!;
    return { code: match[3]!, lang: match[2]! };
}

export function extractBackolonDocs(data: Reflection) {

    const docs: Documentation = {};

    function recur(reflection: Reflection) {
        var comment = reflection.comment;
        if (comment) {
            const tags = Tags.fromComment(comment);
            const backolonTag = tags.has("@backolon");
            if (backolonTag) {
                const category = tags.get("@category")?.value ?? "Miscellaneous";
                const moduleName = tags.get("@module")?.value ?? ".";
                const exampleTags = tags.getAll("@example");
                const examples = exampleTags.map(example => parseExample(example.value));
                const description = md.render(contentToText(comment.summary));
                const moduleDocs = (docs[moduleName] ??= {
                    functions: [],
                    syntax: [],
                    values: []
                });
                if (tags.has("@function")) {
                    const name = tags.get("@function")!.value;
                    const params = tags.getAll("@param");
                    const returnsTag = tags.get("@returns");
                    moduleDocs.functions.push({
                        name,
                        description,
                        examples,
                        returns: returnsTag?.name,
                        returnType: returnsTag?.type,
                        category,
                        params: params.map(tag => {
                            var name = tag.name!;
                            const description = md[/\n/.test(tag.value) ? "render" : "renderInline"](tag.value);
                            const type = tag.type;
                            var lazy, rest;
                            [name, lazy] = name.startsWith("@") ? [name.slice(1), true] : [name, false];
                            [name, rest] = name.endsWith("...") ? [name.slice(0, -3), true] : [name, false];
                            return { name, type, description, lazy, rest };
                        }),
                    });
                } else if (tags.has("@syntax")) {
                    const name = tags.get("@syntax")!.value;
                    const syntaxTags = tags.getAll("@pattern");
                    moduleDocs.syntax.push({
                        name,
                        shapes: syntaxTags.map(tag => tag.value),
                        description,
                        examples,
                        category,
                    });
                } else if (tags.has("@value")) {
                    const name = tags.get("@value")!.value;
                    const typeTag = tags.get("@type");
                    const type = typeTag?.type ?? typeTag?.value ?? undefined;
                    moduleDocs.values.push({
                        name,
                        type,
                        description,
                        examples,
                        category,
                    });
                }
            }
        }
        if ((reflection as any).children) {
            (reflection as any).children.forEach(recur);
        }
        if ((reflection as any).signatures) {
            (reflection as any).signatures.forEach(recur);
        }
    }

    recur(data as any);
    return docs;
}
