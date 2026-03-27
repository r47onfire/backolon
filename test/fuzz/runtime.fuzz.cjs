const { Scheduler, BUILTINS_MODULE, BackolonError } = require("../../dist/backolon.cjs");
module.exports.fuzz = function fuzz(src) {
    // if (!/^[\x32-\x7F]*$/.test(src.toString())) return;
    const s = new Scheduler([BUILTINS_MODULE]);
    try {
        s.startTask(1, src.toString(), null, new URL("about:fuzzer"));
        s.stepUntilSuspended();
    } catch (e) {
        if (!(e instanceof BackolonError)) throw e;
    }
}
