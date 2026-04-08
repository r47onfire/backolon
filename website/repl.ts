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

Type ".help" anytime to see this message again.
Type ".clc" to clear the terminal.
Type ".bye" to close (will reload page).
`;

function initREPL() {
    const scheduler = new Backolon.Scheduler(
        [Backolon.BUILTINS_MODULE, Backolon.FFI_MODULE],
        (output: string) => {
            // Print hook for Backolon print()
            term.echo(output);
        }
    );

    const term = $("#terminal").terminal(
        async command => {
            if (!command.trim()) return;

            // Handle built-in commands
            if (command.toLowerCase() === ".help") {
                term.echo(HELP_TEXT);
                return;
            }

            if (command.toLowerCase() === ".clc") {
                term.clear();
                return;
            }

            if (command.toLowerCase() === ".bye") {
                term.echo("Bye!");
                location.reload();
                return;
            }

            // Execute Backolon code
            try {
                const task = scheduler.startTask(
                    0,
                    command,
                    null,
                    new URL("about:repl")
                );

                // Run the scheduler until the task suspends or completes.
                scheduler.stepUntilSuspended();

                // Get result
                if (task.result) {
                    if (!Backolon.typecheck(Backolon.ThingType.nil)(task.result)) {
                        term.echo(`=> ${Backolon.DEFAULT_UNPARSER.unparse(task.result)}`);
                    }
                } else {
                    term.echo("=> (no result)");
                }
            } catch (err: any) {
                console.error(err);
                if (err instanceof Backolon.BackolonError) {
                    term.error(err.displayOn({}));
                } else {
                    term.error(`Error: ${err?.message ?? String(err)}`);
                }
            }
        },
        {
            greetings: `Backolon 0.0.0\nType ".help" for more information.`,
            name: "backolon_repl",
            prompt: "backolon> ",
            historySize: Infinity, // keep everything, since they're used in tracebacks
            historyFilter: (cmd: string) => cmd.trim().length > 0,
            mousewheel: () => true,
        }
    );

    return term;
}

initREPL();
