import $ from "jquery";
import init from "jquery.terminal";
import * as Backolon from "../src/index";

init(window, $);

const HELP_TEXT = `
Syntax Help:
  Operators:        + - * / % ** = := => ! ; ,
  Control:          if <condition> <true_val> <false_val>
  Variables:        x := value     (declare)
                    x = new_value  (assign)
  Lambdas:          [x y] => body
  Collections:      [x, y] (list)  [x: y] (map)
  Indexing:         list->index  map->key
  Dot Access:       obj.field (shorthand for obj->"field")

Built-in Functions:
  Math:             + - * / % ** << >> | & ^ || &&
  Collections:      + (concatenate) # (length shorthand)
  Control Flow:     if break return
  Metaprogramming:  \`expr  {quasiquote}  \$unquote
  I/O:              print
  JavaScript:       JS_GLOBAL JS_new obj->"field" obj.field

Type "help" anytime to see this message again.
Type "clear" to clear the terminal.
Type "bye" to close (will reload page).
Type Ctrl+D Ctrl+C to interrupt a long-running command.
`;

function textIsComplete(text: string) {
    try {
        Backolon.parse(text, Backolon.UNKNOWN_LOCATION.file);
        return true;
    } catch (e: any) {
        const msg = String(e?.message ?? e);
        return !/was never closed/i.test(msg);
    }
}

function initREPL() {
    const scheduler = new Backolon.Scheduler(
        [Backolon.BUILTINS_MODULE, Backolon.FFI_MODULE],
        (output: string) => {
            // Print hook for Backolon print function
            term.echo(output);
            term.scroll_to_bottom();
        }
    );

    const main_task = scheduler.startTask(0, "", null, Backolon.UNKNOWN_LOCATION.file);

    const main_env = main_task.stack[0]!.env;

    const REPL_FILE_PREFIX = "about:repl#";

    const HISTORY: string[] = [];
    function run() {
        try {
            if (!scheduler.stepUntilSuspended(1000)) return false;
            if (main_task.stack.length > 0) return true;

            // Get result
            const res = main_task.result;
            if (res) {
                // Suppress nil in the same way Python does with None
                if (!Backolon.typecheck(Backolon.ThingType.nil)(res)) {
                    term.echo(`=> ${Backolon.DEFAULT_UNPARSER.unparse(res)}`);
                }
            } else {
                term.echo("=> (no result)");
            }
        } catch (err: any) {
            console.error(err);
            if (err instanceof Backolon.BackolonError) {
                term.error(err.displayOn(Object.fromEntries(HISTORY.map((h, i) => [REPL_FILE_PREFIX + i, h]))));
            } else {
                term.error(`Error: ${err?.message ?? String(err)}`);
            }
            main_task.stack = [];
        }
        main_task.result = null;
        term.resume()
        term.set_command("");
        return true;
    }
    function runLoop() {
        const start = performance.now();
        for (; ;) {
            const progress = run();
            const now = performance.now();
            if (now - start > 8 || !progress) break;
        }
        setTimeout(runLoop, 0);
    }

    const term = $("#terminal").terminal(
        command => {
            if (!command.trim()) return;

            // Handle built-in commands
            if (command.toLowerCase() === "help") {
                term.echo(HELP_TEXT);
                return;
            }

            if (command.toLowerCase() === "bye") {
                term.echo("Bye!");
                location.reload();
                return;
            }

            // Start executing Backolon code
            var code;
            try {
                code = Backolon.parse(command, new URL(REPL_FILE_PREFIX + HISTORY.length));
            } catch (e: any) {
                if (e instanceof Backolon.BackolonError) {
                    term.error(e.displayOn({ [REPL_FILE_PREFIX + HISTORY.length]: command }));
                } else {
                    term.error(e);
                }
                return;
            }
            main_task.enter(code, code.loc, main_env);
            HISTORY.push(command);
            term.pause();
        },
        {
            greetings: "Backolon 0.0.0\nType \"help\" for more information.\nType Ctrl+D Ctrl+C to interrupt a long-running command.",
            name: "backolon_repl",
            prompt(setPrompt) {
                setPrompt(`backolon:${HISTORY.length}> `);
            },
            historyFilter: (cmd: string) => cmd.trim().length > 0,
            mousewheel: () => true,
            scrollOnEcho: true,
            keymap: {
                ENTER(event, original) {
                    if (!textIsComplete(term.get_command())) {
                        term.insert("\n");
                        return true;
                    } else {
                        original(event);
                    }
                },
                "CTRL+C"() {
                    term.error("Interrupted");
                    main_task.stack = [];
                }
            }
        }
    );

    runLoop();

    return term;
}

initREPL();
