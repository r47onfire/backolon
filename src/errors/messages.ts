export type BackolonErrorMessage =
    | "backolon.variable.nonexistent"
    | "backolon.variable.readonly"
    | "backolon.variable.unshadowable"
    | "backolon.math.number.add"
    | "backolon.import.main_cycle"
    | "backolon.import.circular"
    | "backolon.import.unresolvable"
    | "backolon.import.not_found";
