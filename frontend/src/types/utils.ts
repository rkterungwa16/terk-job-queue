/**
 * UNKNOWN / NEVER - exhaustiveness guard for `switch` statements over closed
 * unions (job statuses, reducer actions). The parameter type `never` means
 * this can only be called with a value TypeScript has already proven
 * unreachable; if a new union member is added anywhere this is used and a
 * `case` isn't added for it, the call site stops compiling instead of
 * silently falling through at runtime.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: unreachable branch reached with ${JSON.stringify(value)}`);
}
