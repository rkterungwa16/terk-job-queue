import { EventEmitter } from 'events';

/**
 * ---------------------------------------------------------------------------
 * GENERICS + MAPPED TYPES - a typed wrapper around Node's EventEmitter
 * ---------------------------------------------------------------------------
 * Node's `EventEmitter` types `on`/`emit` with `event: string | symbol` and
 * `...args: any[]` - so `queue.emit('wakeup')` (typo'd casing) or
 * `queue.emit('jobFinished', 42)` (wrong arity) both compile and fail only
 * at runtime. `TEvents` is a mapped-type constraint: every key is an event
 * name, every value is the tuple of argument types that event carries.
 * `TypedEmitter<TEvents>` re-exposes `on`/`off`/`emit` with those keys/tuples
 * substituted in, so misspelled event names and wrong argument lists become
 * compile errors instead of silent no-ops.
 */
export class TypedEmitter<TEvents extends Record<keyof TEvents, unknown[]>> extends EventEmitter {
  override on<K extends keyof TEvents & string>(event: K, listener: (...args: TEvents[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof TEvents & string>(event: K, listener: (...args: TEvents[K]) => void): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof TEvents & string>(event: K, ...args: TEvents[K]): boolean {
    return super.emit(event, ...args);
  }
}
