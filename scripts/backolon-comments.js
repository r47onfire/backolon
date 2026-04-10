import {
    Converter,
    DeclarationReflection,
    LogLevel,
    MinimalSourceFile,
    ReflectionKind
} from "typedoc";
import ts from "typescript";
// THIS IS A HACK AAAAAA
import { lexBlockComment } from "../node_modules/typedoc/dist/lib/converter/comments/blockLexer.js";
import { parseComment } from "../node_modules/typedoc/dist/lib/converter/comments/parser.js";
import { DOC_TAG, FILE_DEFAULTS_TAG, Tags } from "./comment-utils.js";


var gensymCounter = 0;
function gensym() {
    return `__${gensymCounter++}`;
}

/** main entry point for plugin */
export function load(app) {
    var done = false;
    app.converter.on(Converter.EVENT_CREATE_DECLARATION, context => {
        if (done) return;
        const detachedComments = collectDetachedComments(app, context);
        for (var comment of detachedComments) {
            const dummy = new DeclarationReflection(gensym(), ReflectionKind.Interface, context.project);
            dummy.comment = comment;
            context.project.addChild(dummy);
        }
        done = true;
    });
}

function hacky_parse(file, range, app, logger) {
    const context = {
        logger,
        config: app.converter.config,
        files: app.files,
    };
    return parseComment(lexBlockComment(file.text, range.pos, range.end), file, context);
}

function collectDetachedComments(app, context) {
    const comments = [];
    for (var sf of context.program.getSourceFiles()) {
        if (sf.isDeclarationFile || /node_modules/.test(sf.fileName)) continue;
        const text = sf.getFullText();
        const file = new MinimalSourceFile(text, sf.fileName);
        const seenRanges = new Set();
        let defaultComments = undefined;
        const fileComments = [];
        function visit(node) {
            // TODO: detect if node is on a documented symbol or not and skip if true
            const commentRanges = ts.getLeadingCommentRanges(text, node.getFullStart());
            if (commentRanges?.length) {
                for (var r of commentRanges) {
                    // Dedupe comments by position, since inline stuff can be on top of multiple AST nodes
                    // effectively and be gotten multiple times.
                    const key = "" + [r.pos, r.end];
                    if (seenRanges.has(key)) continue;
                    seenRanges.add(key);
                    if (r.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
                    const comment = hacky_parse(file, r, app, context.logger);
                    const tags = Tags.fromComment(comment);


                    if (tags.has(FILE_DEFAULTS_TAG)) {
                        if (defaultComments) {
                            const pos = r.pos + text.slice(r.pos, r.end).indexOf(FILE_DEFAULTS_TAG);
                            app.logger.error(`found second ${FILE_DEFAULTS_TAG} tag`, pos, file);
                        } else {
                            defaultComments = comment;
                        }
                    }
                    else if (tags.has(DOC_TAG)) {
                        fileComments.push(comment);
                        const checkContent = content => {
                            for (var chunk of content) {
                                if (chunk.kind === "inline-tag") {
                                    const pos = r.pos + new RegExp(RegExp.escape("{" + chunk.tag) + "\\s+" + RegExp.escape(chunk.text)).exec(text.slice(r.pos, r.end)).index;
                                    app.logger.warn(`ignoring inline tag ${chunk.tag} in comment text`, pos, file);
                                }
                            }
                        }
                        checkContent(comment.summary);
                        for (var tag of tags.tags) {
                            checkContent(tag.content);
                        }
                    }
                }
            }
            ts.forEachChild(node, visit);
        }
        visit(sf);
        if (defaultComments) {
            for (var comment of fileComments) {
                comment.blockTags.push(...defaultComments.blockTags);
                defaultComments.modifierTags.forEach(t => comment.modifierTags.add(t));
            }
        }
        comments.push(...fileComments);
    }
    return comments;
}
