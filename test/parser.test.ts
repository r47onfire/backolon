import { expect, test } from "bun:test";
import { alternatives, CSTNode, Grammar, literal, MatchFail, parseToCST, regex, repeat_seq, rule, sequence } from "../src";

const csv: Grammar = {
    csv: sequence(rule("header"), literal("\n"), rule("body")),
    header: rule("row"),
    body: repeat_seq(true, rule("row"), literal("\n")),
    row: repeat_seq(true, rule("value"), literal(",")),
    value: alternatives(regex(/"[^"]*"/, "quoted"), regex(/[^,\n]*/, "nonquoted")),
}

console.log("Grammar:", JSON.stringify(csv, null, 2));

const songs = `artist,album,title
Jonathan Coulton,Thing-a-Week 3,Code Monkey
Chuck Berry,single,Too Much Monkey Business
Magic!,Primary Colours,Dance Monkey
Alice in Chains,The Devil Put Dinosaurs Here,Lab Monkey
The Beastie Boys,Licensed to Ill,Brass Monkey
The Rolling Stones,Let it Bleed,Monkey Man
Steely Dan,Pretzel Logic,Monkey In Your Soul
Foo Fighters,The Colour and the Shape,Monkey Wrench
Animal Collective,Centipede Hz,Monkey Riches
Harry Belafonte,Jump Up Calypso,Monkey
The Beatles,The Beatles (White Album),"Everybody's Got Something To Hide, Except For Me And My Monkey"`;

const cst = parseToCST(songs, 0, "csv", csv);

const concatenateAll = (cst: CSTNode): string => {
    return cst.text ? cst.text : cst.children ? cst.children.reduce((p, c) => p + concatenateAll(c), "") : "";
}

test("a", () => {
    expect(cst).not.toBeInstanceOf(MatchFail);
    (function walk(cst: CSTNode) {
        expect(songs.slice(cst.start, cst.end)).toEqual(concatenateAll(cst));
        cst.children?.forEach(walk);
    })(cst as CSTNode);
    console.log("CST:", JSON.stringify(cst, null, 2));
});
