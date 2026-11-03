const { parse, BackolonError } = require("../../dist/index.cjs");
module.exports.fuzz = function fuzz(src) {
    // if (!/^[\x20-\x7F]*$/.test(src.toString())) return;
    try {
        parse(src.toString(), new URL("about:fuzzer"));
    } catch (e) {
        if (!(e instanceof BackolonError)) throw e;
    }
};
