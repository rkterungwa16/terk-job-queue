import type { Types } from 'mongoose';

/**
 * ---------------------------------------------------------------------------
 * UNION TYPES
 * ---------------------------------------------------------------------------
 * `JobStatus` is a closed set of string literals rather than `string`. This
 * is the backbone of every "discriminated state machine" pattern used below:
 * because the union is closed, TypeScript can prove at compile time whether
 * a `switch` over it is exhaustive (see `assertNeverStatus` at the bottom).
 * A plain `string` would let a typo like `'complated'` slip through silently
 * both here and in Mongo queries built from it.
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'paused' | 'paused_while_processing';

export type RecurrenceInterval = 'hourly' | 'daily' | 'weekly';

/**
 * ---------------------------------------------------------------------------
 * KEYOF / INDEXED ACCESS TYPES + MAPPED TYPES
 * ---------------------------------------------------------------------------
 * `StatsStatus` is derived from `JobStatus` with `Exclude` (a conditional
 * type under the hood) rather than retyped by hand, so if a new status is
 * ever added to `JobStatus`, this narrows/widens automatically instead of
 * silently going stale.
 *
 * `StatusCounts` is a mapped type (`Record<K, V>` maps every member of the
 * `StatsStatus` union to a `number`). This is what lets `getDashboardStats`
 * return an object that is *statically guaranteed* to have exactly one key
 * per dashboard-relevant status - add a status to the union and the compiler
 * will flag every object literal that forgets to initialize it.
 */
export type StatsStatus = Exclude<JobStatus, 'paused_while_processing'>;
export type StatusCounts = Record<StatsStatus, number>;

/**
 * ---------------------------------------------------------------------------
 * GENERICS + KEYOF: job payloads keyed by job name
 * ---------------------------------------------------------------------------
 * Job payloads are heterogeneous in general (a "sendNotification" job needs
 * an email + subject; a future "generateReport" job would need something
 * else entirely). Instead of typing `data: any`/`unknown` everywhere and
 * re-validating by hand at every call site, we register each job's payload
 * shape in one map and derive everything else from it with `keyof` and
 * indexed access types (`JobPayloadMap[K]`).
 */
export interface SendNotificationPayload {
  userId: string;
  eventId: string;
  email: string;
  subject: string;
  messageText: string;
}

export interface JobPayloadMap {
  sendNotification: SendNotificationPayload;
}

/** `keyof` - the set of registered job names, derived, never hand-maintained. */
export type JobName = keyof JobPayloadMap;

/** Indexed access type - "the payload type registered for job name K". */
export type PayloadFor<K extends JobName> = JobPayloadMap[K];

/**
 * ---------------------------------------------------------------------------
 * GENERIC DOMAIN INTERFACE
 * ---------------------------------------------------------------------------
 * `Job<TData>` is intentionally an `interface` (see docs/TYPESCRIPT_DECISIONS.md
 * for the interface-vs-type rationale): callers extend/augment it, and
 * Mongoose's own document types are merged onto it via `extends` elsewhere.
 * The generic parameter defaults to `unknown` (not `any`) so that consumers
 * are forced to narrow before touching `.data` - see `unknown` section below.
 */
export interface Job<TData = unknown> {
  _id: Types.ObjectId;
  name: string;
  data: TData;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  isRecurring: boolean;
  interval: RecurrenceInterval | null;
  uniqueKey: string | null;
  errorReason: string | null;
  errorStack: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A job whose name is known to be registered, with its payload narrowed via `PayloadFor`. */
export type TypedJob<K extends JobName> = Job<PayloadFor<K>> & { name: K };

/**
 * ---------------------------------------------------------------------------
 * GENERIC WORKER FUNCTION TYPE
 * ---------------------------------------------------------------------------
 * Generic over the job name `K`. Given `K`, the worker's `job` parameter is
 * automatically typed to the correct payload - if `executeNotificationWorker`
 * tries to read `job.data.wrongField`, that's a compile error, not a runtime
 * `undefined`.
 */
export type JobWorker<K extends JobName> = (job: TypedJob<K>, signal: AbortSignal) => Promise<void>;

/**
 * ---------------------------------------------------------------------------
 * DISCRIMINATED UNION - "job outcome" state machine
 * ---------------------------------------------------------------------------
 * This is the core "discriminated state machine" pattern used in
 * `BaseJobQueue.next()`. Instead of a tangle of `if/else` branches each
 * re-deriving what the next DB write should look like from booleans and
 * error objects, job processing resolves to exactly one of these tagged
 * variants. Each variant carries only the fields that make sense for it
 * (e.g. `retry` carries `delayMs`, `exhausted` carries a `stack`) - you
 * cannot accidentally construct a `success` outcome with an `errorReason`,
 * because the type doesn't have that field.
 *
 * The `kind` field is the discriminant: narrowing on it (via `switch`)
 * lets TypeScript narrow the whole union member, including fields unique
 * to that branch - true "type narrowing", not just an `if` on a string.
 */
export type JobOutcome =
  | { kind: 'success' }
  | { kind: 'retry'; delayMs: number; reason: string; stack: string }
  | { kind: 'exhausted'; reason: string; stack: string }
  | { kind: 'paused' };

/**
 * ---------------------------------------------------------------------------
 * UNKNOWN / NEVER
 * ---------------------------------------------------------------------------
 * `assertNeverStatus` exists purely so that adding a new `JobStatus` member
 * without updating every `switch` that branches on it becomes a *compile*
 * error instead of a silent runtime fallthrough. Its parameter type is
 * `never`: the only way to legally call it is with a value TypeScript has
 * already proven is impossible, i.e. every case was already handled.
 */
export function assertNeverStatus(status: never): never {
  throw new Error(`Unhandled JobStatus: ${String(status)}`);
}

/**
 * A generic exhaustiveness helper for any closed union, used the same way
 * (kept separate from the status-specific one above for a clearer error
 * message at each call site).
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: unreachable branch reached with value ${JSON.stringify(value)}`);
}

/**
 * ---------------------------------------------------------------------------
 * CONDITIONAL TYPE
 * ---------------------------------------------------------------------------
 * `ExtractPayload<T>` pulls the payload type back out of a `Job<TData>` (or
 * any type shaped like one) using `infer`. Not something the app strictly
 * needs at runtime, but it's what lets shared frontend/backend code write
 * `type NotificationData = ExtractPayload<TypedJob<'sendNotification'>>`
 * instead of re-declaring the payload shape a third time.
 */
export type ExtractPayload<T> = T extends Job<infer D> ? D : never;

/**
 * ---------------------------------------------------------------------------
 * UTILITY TYPES - options / partial updates
 * ---------------------------------------------------------------------------
 * `Pick`/`Partial`/`Omit` build precise, narrow types from the wide `Job`
 * interface instead of new ad-hoc interfaces that could drift out of sync.
 */
export type AddJobOptions = Partial<{
  delayMs: number;
  isRecurring: boolean;
  interval: RecurrenceInterval | null;
  uniqueKey: string | null;
}>;

/** Only the fields `next()` is ever allowed to `$set` on a job document. */
export type JobStatusUpdate = Partial<Pick<Job, 'status' | 'attempts' | 'runAt' | 'errorReason' | 'errorStack'>>;
