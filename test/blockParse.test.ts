import { describe, expect, test } from "bun:test";
import { parse, ThingType, unparse } from "../src";
import { expectParse, expectParseError, makespec } from "./astCheck";

test("top-level block", () => {
    expectParse("",
        makespec(ThingType.topblock));
});
test("symbol", () => {
    expectParse("hello",
        makespec(ThingType.topblock, null,
            makespec(ThingType.name, "hello")));
});
test("raw string", () => {
    expectParse("'hello'",
        makespec(ThingType.topblock, null,
            makespec(ThingType.string, "hello")));
});
test("string", () => {
    expectParse('"hello"',
        makespec(ThingType.topblock, null,
            makespec(ThingType.string, "hello")));
});
describe("numbers", () => {
    test("float", () => {
        expectParse("123.45",
            makespec(ThingType.topblock, null,
                makespec(ThingType.number, 123.45)));
    });
    test("scientific", () => {
        expectParse("123.45e67",
            makespec(ThingType.topblock, null,
                makespec(ThingType.number, 123.45e67)));
    });
    test("int", () => {
        expectParse("123",
            makespec(ThingType.topblock, null,
                makespec(ThingType.number, 123)));
    });
    test("hex", () => {
        expectParse("0x123",
            makespec(ThingType.topblock, null,
                makespec(ThingType.number, 0x123)));
    });
    test("bin", () => {
        expectParse("0b111",
            makespec(ThingType.topblock, null,
                makespec(ThingType.number, 0b111)));
    });
    test("bigint", () => {
        expectParse("1982468126408127409127406104961092640912764091674",
            makespec(ThingType.topblock, null,
                makespec(ThingType.number, 1982468126408127409127406104961092640912764091674n)));
    });
});
describe("strings", () => {
    test("parses raw string and ignores escapes except for single 's", () => {
        expectParse("'hello\\u0001'",
            makespec(ThingType.topblock, null,
                makespec(ThingType.string, "hello\\u0001")));
        expectParse("'hello\\u{a234'",
            makespec(ThingType.topblock, null,
                makespec(ThingType.string, "hello\\u{a234")));
        expectParse("'hello\\''",
            makespec(ThingType.topblock, null,
                makespec(ThingType.string, "hello'")));
    });
    test("parses normal string and processes escapes", () => {
        expectParse("\"hello\\u0001\"",
            makespec(ThingType.topblock, null,
                makespec(ThingType.string, "hello\u0001")));
        expectParseError("\"\\u{1234567890}\"", "escape out of range");
        expectParseError("\"\\u{\"", "\"\\\"\" was never closed");
    });
    test("parses string with interpolations", () => {
        expectParse("\"hello {world+\"another string\"}\"",
            makespec(ThingType.topblock, null,
                makespec(ThingType.stringblock, null,
                    makespec(ThingType.string, "hello "),
                    makespec(ThingType.roundblock, null,
                        makespec(ThingType.name, "world"),
                        makespec(ThingType.operator, "+"),
                        makespec(ThingType.string, "another string")))));
    });
    test("parses string with escaped curlies", () => {
        expectParse("\"hello\\{\"",
            makespec(ThingType.topblock, null,
                makespec(ThingType.string, "hello{")));
    })
});
describe("symbols", () => {
    test("operators and words", () => {
        expectParse("a+b",
            makespec(ThingType.topblock, null,
                makespec(ThingType.name, "a"),
                makespec(ThingType.operator, "+"),
                makespec(ThingType.name, "b")));
    });
    test("operators don't get merged", () => {
        expectParse("a+=&b",
            makespec(ThingType.topblock, null,
                makespec(ThingType.name, "a"),
                makespec(ThingType.operator, "+"),
                makespec(ThingType.operator, "="),
                makespec(ThingType.operator, "&"),
                makespec(ThingType.name, "b")));
    });
    test("whitespace counts as a symbol", () => {
        expectParse("  ",
            makespec(ThingType.topblock, null,
                makespec(ThingType.space, "  ")));
    });
});
describe("blocks", () => {
    test("blocks can nest", () => {
        expectParse("([{}])",
            makespec(ThingType.topblock, null,
                makespec(ThingType.roundblock, null,
                    makespec(ThingType.squareblock, null,
                        makespec(ThingType.curlyblock, null)))));
    });
    describe("comment blocks", () => {
        test("comment blocks ignore all inside", () => {
            expectParse("##((((\"'//[}[)##",
                makespec(ThingType.topblock, null,
                    makespec(ThingType.space, null)));
        });
        test("line comment blocks can be terminated with EOF or newline and don't eat newline token", () => {
            expectParse("# hi\n",
                makespec(ThingType.topblock, null,
                    makespec(ThingType.space, null),
                    makespec(ThingType.newline, null)));
            expectParse("# hi",
                makespec(ThingType.topblock, null,
                    makespec(ThingType.space, null)));
        });
        test("comments round-trip", () => {
            expect(unparse(parse("## hi ##"))).toEqual("## hi ##")
            expect(unparse(parse("# hi\n"))).toEqual("# hi\n")
        });
        test("block comments complain if they're not closed", () => {
            expectParseError("##", "\"##\" was never closed");
        });
    });
    test("unmatched", () => {
        expectParseError("(", "\"(\" was never closed");
        expectParseError("[", "\"[\" was never closed");
        expectParseError("{", "\"{\" was never closed");
        expectParseError("\"", "\"\\\"\" was never closed");
        expectParseError("'", "\"'\" was never closed");
        expectParseError(")", "unexpected \")\"");
        expectParseError("]", "unexpected \"]\"");
        expectParseError("}", "unexpected \"}\"");
    });
});
