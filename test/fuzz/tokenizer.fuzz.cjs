const tokenize = require("../../dist/backolon.cjs").tokenize;
module.exports.fuzz = function fuzz(src) {
    // if (!/^[\x32-\x7F]*$/.test(src.toString())) return;
    tokenize(src.toString());
}
