import { Tags, contentToText } from "./comment-utils.js";

function parseMarkdown(string) {
    return string;
}

function parseExample(string) {
    const match = /(```|~~~)(.+?)\n([\s\S]+)\1/.exec(string);
    return { code: match[3], lang: match[2] };
}

/**
 * @typedef {import("./doc").Documentation} Documentation
 */

export function extractBackolonDocs(data) {

    /**
     * @type {Documentation}
     */
    const docs = {};

    function recur(reflection) {
        var comment = reflection.comment;
        if (comment) {
            const tags = Tags.fromComment(comment);
            const backolonTag = tags.has("@backolon");
            if (backolonTag) {
                const category = tags.get("@category")?.value ?? "Miscellaneous";
                const moduleName = tags.get("@module")?.value ?? null;
                const exampleTags = tags.getAll("@example");
                const examples = exampleTags.map(example => parseExample(example.value));
                const description = parseMarkdown(contentToText(comment.summary));
                // console.log({ category, module, exampleTags, description });
                const moduleDocs = (docs[moduleName] ??= {
                    functions: [],
                    syntax: [],
                    values: []
                });
                if (tags.has("@function")) {
                    const name = tags.get("@function").value;
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
                            var name = tag.name;
                            const description = parseMarkdown(tag.value);
                            const type = tag.type;
                            var lazy, rest;
                            [name, lazy] = name.startsWith("@") ? [name.slice(1), true] : [name, false];
                            [name, rest] = name.endsWith("...") ? [name.slice(0, -3), true] : [name, false];
                            return { name, type, description, lazy, rest };
                        }),
                    });
                } else if (tags.has("@syntax")) {
                    const syntax = tags.get("@syntax").value;
                    moduleDocs.syntax.push({
                        shape: syntax,
                        description,
                        examples,
                        category,
                    });
                } else if (tags.has("@value")) {
                    const name = tags.get("@value").value;
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

        if (reflection.children) {
            reflection.children.forEach(recur);
        }
        if (reflection.signatures) {
            reflection.signatures.forEach(recur);
        }
    }

    recur(data);
    return docs;
}
