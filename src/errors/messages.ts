import { CSTNode } from "@r47onfire/nebula";
import { Module } from "../runtime/modules/module";
import { Identifier } from "../utils";

export type BackolonErrorArgs = {
    "backolon.variable.nonexistent": [name: string];
    "backolon.variable.readonly": [name: string];
    "backolon.variable.unshadowable": [name: string];
    "backolon.operator.wrong_type.binary": [op: string, left: any, right: any];
    "backolon.operator.divide_by_zero": [left: any, right: any];
    "backolon.operator.wrong_type.unary": [op: string, obj: any];
    "backolon.operator.wrong_type.compare": [op: string, left: any, right: any];
    "backolon.call.no_signature": [obj: any];
    "backolon.call.not_callable": [obj: any];
    "backolon.call.duplicate_argument": [name: Identifier];
    "backolon.call.lazy_computed": [name: Identifier];
    "backolon.call.missing_argument": [name: Identifier];
    "backolon.call.too_many_arguments": [];
    "backolon.call.unknown_keyword": [name: Identifier];
    "backolon.call.splat.not_iterable": [obj: any];
    "backolon.call.kw_splat.not_a_mapping": [obj: any];
    "backolon.call.kw_splat.lazy_computed": [obj: any];
    "backolon.block.not_a_mapping": [obj: any];
    "backolon.eval.unknown_cst_type": [node: CSTNode<any>];
    "backolon.eval.cst_type_not_runnable": [node: CSTNode<any>];
    "backolon.eval.not_a_cst_node": [obj: any];
    "backolon.string.unknown_escape": [esc: any];
    "backolon.import.main_cycle": [];
    "backolon.import.circular": [culprits: Module[]];
    "backolon.import.unresolvable": [url: URL];
    "backolon.import.not_found": [url: URL];
};

export type BackolonErrorMessageKey = keyof BackolonErrorArgs;

export const english: Record<BackolonErrorMessageKey, string> = {
    "backolon.variable.nonexistent": "variable {0} not found",
    "backolon.variable.readonly": "{0} is a constant",
    "backolon.variable.unshadowable": "{0} is special and cannot be shadowed",
    "backolon.operator.wrong_type.binary":
        "unsupported operation {0} for {1|type} and {2|type}",
    "backolon.operator.divide_by_zero": "attempted division by zero",
    "backolon.operator.wrong_type.unary":
        "unsupported operaton {0} on {1|type}",
    "backolon.operator.wrong_type.compare":
        "cannot compare {1|type} and {2|type}",
    "backolon.call.no_signature": "{0|type} is missing a signature",
    "backolon.call.not_callable": "{0|type} is not callable",
    "backolon.call.duplicate_argument": "duplicate keyword argument {0}",
    "backolon.call.lazy_computed":
        "cannot unpack iterable into lazy argument {0}",
    "backolon.call.missing_argument": "missing value for required argument {0}",
    "backolon.call.too_many_arguments": "too many arguments",
    "backolon.call.unknown_keyword": "unknown keyword argument {0}",
    "backolon.call.splat.not_iterable":
        "{0|type} cannot be unpacked because it is not iterable",
    "backolon.call.kw_splat.not_a_mapping":
        "{0|type} cannot be unpacked because it does not represent a mapping",
    "backolon.call.kw_splat.lazy_computed":
        "cannot unpack mapping into lazy keyword argument {0}",
    "backolon.block.not_a_mapping": "block requires a mapping argument",
    "backolon.eval.unknown_cst_type": "unknown CST node type {0}",
    "backolon.eval.cst_type_not_runnable": "CST type {0} has no implementation",
    "backolon.eval.not_a_cst_node": "cannot run {0} as a CST node",
    "backolon.string.unknown_escape": "unknown escape {0}",
    "backolon.import.main_cycle": "main module imported itself",
    "backolon.import.circular": "circular import from {}", // TODO: how to format a list?
    "backolon.import.unresolvable": "could not resolve {0.href}",
    "backolon.import.not_found": "module {0.href} not found",
};
