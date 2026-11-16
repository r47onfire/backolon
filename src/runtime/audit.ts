import type { BackolonVM } from "./vm";
/**
 * Map of the audit events a {@link BackolonVM} can emit through its event
 * dispatcher, from event name to payload type. These events mark operations
 * that are potentially unsafe or reach outside the sandbox (host-language
 * interop), so an embedding application can hook, log, or veto them. Additional
 * events may be registered by index signature.
 */
export interface BackolonAuditEvents {
    [x: string]: unknown;
    // potentially unsafe things
    add_audit_hook: void;
    call_js_function: [f: Function, args: any[]];
    object_get_prop: [key: PropertyKey, o: any];
    object_set_prop: [key: PropertyKey, o: any, value: any];
    object_del_prop: [key: PropertyKey, o: any];
    loop_check: number;
}
