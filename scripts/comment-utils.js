export const DOC_TAG = "@backolon";
export const FILE_DEFAULTS_TAG = "@file";

export function contentToText(content) {
    return content.map(v => v.text).join("");
}
class Tag {
    constructor(id, name, type, value) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.content = value;
    }
    get value() {
        return contentToText(this.content);
    }
}
export class Tags {
    constructor(tags) { this.tags = tags; }
    static fromComment(comment) {
        return new Tags([
            ...(comment.blockTags ?? []).map(({ tag, name, typeAnnotation, content }) => new Tag(tag, name, typeAnnotation, content)),
            ...([...(comment.modifierTags ?? [])]).map(name => new Tag(name, "", "", [])),
        ]);
    }
    getAll(id) {
        return this.tags.filter(t => t.id === id);
    }
    get(id) {
        return (this.getAll(id) ?? [])[0];
    }
    has(id) {
        return this.getAll(id).length > 0;
    }
}
