const { parse, BackolonError } = require("../../dist/backolon.cjs");
module.exports.fuzz = function fuzz(src) {
    // if (!/^[\x20-\x7F]*$/.test(src.toString())) return;
    try {
        parse(src.toString(), new URL("about:fuzzer"));
    } catch (e) {
        if (!(e instanceof BackolonError)) throw e;
    }
}
