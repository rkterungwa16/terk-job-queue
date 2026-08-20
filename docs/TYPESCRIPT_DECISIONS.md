# TypeScript & React Decisions

This document explains *where* each requested TypeScript concept and React
pattern is used in this codebase and, more importantly, *why* — the goal
throughout was to reach for each concept only where it earns its place, not
to decorate the code with features for their own sake.

---

## Part 1 — TypeScript concepts

### Interface vs. type aliases

Rule of thumb applied consistently across the codebase: **`interface` for
object shapes that represent a contract something can extend, implement, or
merge with; `type` for everything else** (unions, mapped/conditional types,
mechanical intersections, function types).

- `Job<TData>` (`backend/src/types/job.types.ts`) is an `interface` because
  it's a genuine domain contract — `TypedJob<K>` extends it with `& { name: K }`,
  and Mongoose's own document type is merged onto it (`HydratedDocument<Job>`
  in `job.model.ts`). Interfaces support declaration merging and are the
  conventional choice for "this shape, possibly extended later."
- `JobDocument` (`backend/src/domain/model/job.model.ts`) is a `type`
  because it's a one-off mechanical combination (`HydratedDocument<Job>`) —
  nothing extends *it*, it's just a convenient alias.
- `JobStatus`, `AsyncState<T>`, `JobOutcome` are all `type` because they're
  unions, which `interface` cannot express at all.
- `AuthenticatedRequest extends Request` (`auth.middleware.ts`) is an
  `interface` specifically *because* it extends another interface
  (Express's `Request`) — this is the textbook case for `interface extends`.

### Generics

Used wherever a piece of code's *shape* is fixed but the *type it operates
on* varies by call site:

- `Job<TData = unknown>` and `JobWorker<K extends JobName>`
  (`backend/src/types/job.types.ts`) — the queue's core domain types are
  generic over the job payload, so `executeNotificationWorker`'s `job.data`
  is statically known to be a `SendNotificationPayload`, not `any`.
- `validateQuery<TSchema extends ZodTypeAny>` /
  `validateBody<TSchema extends ZodTypeAny>`
  (`backend/src/adapters/middleware/validate.middleware.ts`) — generic over
  the *schema*, not directly over its output, specifically so schemas using
  `.transform()` (different input vs. output types, like the string→number
  page/limit coercion in `admin.routes.ts`) still type-check correctly.
- `TypedEmitter<TEvents>` (`backend/src/domain/queue/typedEmitter.ts`) —
  generic over an event-name-to-argument-tuple map, so `queue.emit('wakeUp')`
  is checked against the actual declared event signatures instead of Node's
  untyped `EventEmitter` (`string | symbol`, `...args: any[]`).
- `useAsync<T>` and `useDebouncedValue<T>`
  (`frontend/src/hooks/`) — generic fetch/debounce hooks reused for
  differently-shaped data (`DashboardStatsResponse`, `FailedJobsResponse`,
  a plain search string) without rewriting the hook per use.
- `apiGet<TResponse>` / `apiPost<TResponse, TBody>`
  (`frontend/src/api/client.ts`) — every call site gets a fully-typed
  response with no casting outside the client module itself.

### Union types

The backbone of the whole domain model. `JobStatus`, `RecurrenceInterval`,
and `JobName` (backend) and `JobStatus` (frontend, kept structurally
identical) are all closed sets of string literals rather than `string`.
This is what makes exhaustiveness checking possible at all (see
"unknown/never" below) — a plain `string` would let a typo like
`'complated'` compile silently both in application code and in MongoDB
queries built from it.

### Discriminated unions

Two significant uses, both intentionally described as "state machines"
because that's what they model:

1. **`JobOutcome`** (`backend/src/types/job.types.ts`) — the result of
   processing a job resolves to exactly one of
   `{kind:'success'} | {kind:'retry',...} | {kind:'exhausted',...} | {kind:'paused'}`.
   `classifyFailure()` in `baseQueue.ts` is a *pure function* from
   `(job, error) → JobOutcome` with no DB access — separating "decide what
   happened" from "write it to Mongo" (`buildFinalizePipeline`) makes each
   half independently reasoned about, and the discriminant (`kind`) means
   each branch only has the fields relevant to it (you cannot construct a
   `success` outcome that also carries an `errorReason` — the type doesn't
   have that field).
2. **`AsyncState<TData>`** (`frontend/src/types/api.ts`) — every
   network-backed piece of UI state is `{status:'idle'} | {status:'loading'} | {status:'success',data} | {status:'error',error}`
   instead of three independent booleans (`isLoading`/`isError`/`data`) that
   can drift into impossible combinations (loading *and* stale data *and* a
   leftover error, all `true`/present at once — a state that shouldn't
   exist but compiles fine with separate booleans). `StatsPanel.tsx` and
   `Dashboard.tsx`'s `FailedJobsBody` both `switch` on `.status` to render
   each case, with an `assertNever` default branch enforcing exhaustiveness.
3. **`SelectionAction`** (`frontend/src/hooks/useSelection.ts`) — the
   bulk-retry checkbox reducer's actions
   (`{type:'toggle',id} | {type:'selectAll',ids} | {type:'clear'}`) are a
   discriminated union too, reduced via a `switch` in `selectionReducer`.

### Type narrowing

Every `catch` block, every `unknown`-typed value, and every discriminated
union `switch` in this codebase relies on narrowing rather than casting:

- `err instanceof Error` narrows `unknown` catch variables before touching
  `.message`/`.stack`/`.name` (`baseQueue.ts`, `client.ts`, `database.ts`,
  `server.ts`).
- `isDuplicateKeyError(error): error is { code: 11000 }` and
  `isUserPayload(payload): payload is AuthenticatedUser`
  (backend) and `isErrorBody(body): body is { error: string }` (frontend
  `client.ts`) are user-defined type guards — structural checks on
  `unknown` values that the compiler then trusts for the rest of that
  branch, rather than an unchecked `as` cast.
- `switch (state.status)` in `StatsPanel.tsx`/`Dashboard.tsx` and
  `switch (outcome.kind)` in `buildFinalizePipeline` both narrow the whole
  union member (including fields unique to that branch) from a single tag
  check.

### Utility types

- `Partial<{...}>` — `AddJobOptions` (`job.types.ts`): every option to
  `queue.add()` is optional, and rather than hand-writing `field?: T` five
  times, the base shape is defined once and wrapped in `Partial`.
- `Pick<Job, 'status' | 'attempts' | 'runAt' | 'errorReason' | 'errorStack'>` —
  `JobStatusUpdate` (`job.types.ts`): documents precisely which subset of
  `Job`'s fields the queue is ever allowed to `$set`, derived from the
  canonical `Job` interface instead of duplicated by hand (so if `Job`
  gains/renames a field, this either updates automatically or fails to
  compile if the picked key no longer exists).
- `Exclude<JobStatus, 'paused_while_processing'>` — `StatsStatus`
  (`job.types.ts`): the dashboard-facing status set is *derived* from the
  full internal status set by subtracting the one internal-only transient
  state, rather than maintained as a second hand-written union that could
  drift out of sync with the first.
- `Record<K, V>` — used repeatedly as a mapped-type utility:
  `StatusCounts = Record<StatsStatus, number>` (backend),
  `Record<JobStatus, string>` for the frontend's status label/color maps
  (`StatusBadge.tsx`, `StatsPanel.tsx`) — each forces the object literal to
  have exactly one entry per union member, so adding a status without
  updating every lookup table becomes a compile error, not a runtime
  `undefined`.

### `keyof` / indexed access types

- `JobName = keyof JobPayloadMap` (`job.types.ts`) — the set of valid job
  names is *derived* from the payload registry, never hand-maintained
  separately from it.
- `PayloadFor<K extends JobName> = JobPayloadMap[K]` — an indexed access
  type: "the payload type registered under key `K`." This is what lets
  `TypedJob<'sendNotification'>` resolve to a job whose `.data` is exactly
  `SendNotificationPayload`, with the mapping expressed once.
- The comment in `StatusBadge.tsx` notes `keyof typeof STATUS_COLORS` as
  the idiom for deriving a key-union from an object literal, the mirror
  image of the `Record<K,V>` direction used elsewhere.

### Type inference

Leaned on deliberately rather than fought:

- `z.infer<TSchema>` (`validate.middleware.ts`, `admin.routes.ts`,
  `alert.routes.ts`) — Zod schema *definitions* are the single source of
  truth; TypeScript infers the validated output shape from them instead of
  a hand-written interface that could drift from the actual runtime
  validation.
- Every hook's return type (`useAsync`, `useFailedJobs`, `useQueueStats`) is
  left to inference rather than manually annotated — annotating a return
  type identical to what the compiler would infer anyway just adds a second
  place for it to go stale.
- `useMemo`/`useCallback` call sites throughout the frontend rely on
  inference for their generic type parameter (derived from the callback's
  return type) rather than explicit `<T>` annotations.

### `unknown` / `never`

- **`unknown`** is used for exactly the values that genuinely could be
  anything and must be narrowed before use: `Job<TData = unknown>`'s
  default, every `catch (err)` variable, `fetch(...).json()`'s result in
  `client.ts` (immediately typed `unknown` rather than letting `Response.json()`'s
  native `any` leak further into the app). This is the core discipline of
  `unknown` vs. `any`: `any` opts a value *out* of type checking entirely;
  `unknown` requires a narrowing check before any operation is permitted.
- **`never`** powers exhaustiveness checking end to end:
  `assertNever(value: never, context: string): never` (defined once per
  package, `job.types.ts` and `frontend/src/types/utils.ts`) can only be
  legally *called* with a value TypeScript has already proven unreachable —
  i.e., every real case of a `switch` was already handled. It's used as the
  `default` branch in `buildFinalizePipeline` (backend), `selectionReducer`
  (frontend reducer), and every `AsyncState`/`JobOutcome` switch. Add a new
  union member anywhere and forget to handle it in one of these switches,
  and that file stops compiling — the failure mode is a build error, not a
  silent runtime fallthrough.

### Mapped and conditional types

- **Mapped types**: `Record<K, V>` (used throughout, see "utility types"
  above) is itself a mapped type — `{ [P in K]: V }` under the hood.
  `TypedEmitter<TEvents extends Record<keyof TEvents, unknown[]>>`
  (`typedEmitter.ts`) uses a self-referential mapped-type constraint
  (`TEvents extends Record<keyof TEvents, unknown[]>`) specifically to
  avoid requiring an explicit index signature on every event-map interface
  passed in — a known idiom for typed event emitters.
- **Conditional type**: `ExtractPayload<T> = T extends Job<infer D> ? D : never`
  (`job.types.ts`) pulls the payload type back out of a `Job<TData>` using
  `infer` — not something the running app strictly needs today, but it's
  the mechanism that would let shared code write
  `type NotificationData = ExtractPayload<TypedJob<'sendNotification'>>`
  instead of re-declaring the payload shape a third time. Included as a
  worked example of `infer`-based extraction since it was explicitly
  requested; `Exclude<JobStatus, 'paused_while_processing'>` (see "utility
  types") is a conditional type as well — `Exclude` is defined in terms of
  a conditional type internally.

---

## Part 2 — React performance patterns (with the correct hook, per case)

Every hook below was chosen for a specific, stated reason — none are
default/reflexive uses of `memo`/`useCallback`/`useMemo`. Full reasoning is
also inline-commented at each call site; this section is the consolidated
version.

| Hook / pattern | Where | Why this one, specifically |
|---|---|---|
| `AbortController` + `useEffect` cleanup | `useAsync.ts` | Prevents out-of-order network responses from clobbering fresher state — a real race condition, not just wasted work. |
| `useRef` for a "latest callback" | `useAsync.ts` | Callers pass inline closures as `fetcher`; without stashing in a ref, listing `fetcher` in the effect's deps would refetch on every render regardless of whether anything meaningful changed. |
| `useCallback` | `useAsync.refetch`, `useQueueStats`/`useFailedJobs`'s fetcher functions, `Dashboard`'s event handlers, `FailedJobsTable.handleToggle` | Stable function identity is what makes `React.memo` on children (`FailedJobRow`, `StatCard`) and dependency arrays elsewhere (the polling `setInterval` in `useQueueStats`) actually work — a memoized component fed a new callback prop every render gets no benefit from `memo` at all. |
| `useMemo` | `useFailedJobs`'s `params` object, `StatsPanelGrid`'s `total`, `FailedJobsTable`'s `allIds` | Object/array literals are new references every render by default; memoizing on their real primitive inputs is what stops that from cascading into unnecessary refetches or child re-renders downstream. |
| `React.memo` | `StatCard`, `StatusBadge`, `FailedJobRow`, `PaginationControls` | Leaf/row components re-rendered in a list or grid where most siblings' props don't change between renders — the highest-leverage spot is `FailedJobRow`, since toggling one checkbox would otherwise re-diff every row in a 100-row page. |
| `useReducer` | `useSelection.ts` | The bulk-retry selection has multiple *kinds* of transitions (toggle/selectAll/clear) that all derive the next state from the previous one — centralizing that logic in a reducer (vs. three scattered `setState` calls) is both more correct and gives a `dispatch` with a stable identity for free, no `useCallback` needed to pass it to memoized children. |
| Debounce (custom `useDebouncedValue`, *not* `useDeferredValue`) | `useFailedJobs.ts` via `hooks/useDebouncedValue.ts` | The goal is fewer network requests while typing. `useDeferredValue` only deprioritizes a *render*, it doesn't delay the value itself — it wouldn't reduce request volume. A genuine time-based debounce is the correct tool; documented explicitly in `useDebouncedValue.ts` to avoid this common mix-up. |
| `useTransition` | `Dashboard.tsx`, wrapping the pagination `setPage` call | Page changes trigger both a state update and a network fetch; without a transition, React treats the update as urgent and would blank the table immediately. `startTransition` keeps the current page's rows on screen while the next page loads, exposing `isPending` for a subtle in-progress indicator instead of a jarring flash. |
| Page Visibility API + `useEffect` | `useQueueStats.ts` | Polling a dashboard left open in a background tab wastes requests and CPU indefinitely; the interval is only armed while the tab is actually visible, with an immediate `refetch()` on regaining visibility so numbers aren't stale when the user comes back. |
| `useId` | `SearchBar.tsx`, `ScheduleJobForm.tsx`, `PauseResumeForm.tsx` | Correct `<label htmlFor>`/`<input id>` association for accessibility without a hardcoded id string that could collide if a component were ever rendered more than once. |
| `useMutation<TInput, TOutput>` | `hooks/useMutation.ts`, used by `ScheduleJobForm`/`PauseResumeForm` | Write operations (schedule/pause/resume) have the same idle→loading→success/error shape as reads, so this reuses `AsyncState<T>` rather than inventing a parallel state type - the only real difference from `useAsync` is that `mutate` fires from an event handler, not a `useEffect`. |

### Polymorphism

`TypedEmitter` (`typedEmitter.ts`) demonstrates parametric polymorphism via
generics (one implementation, many event-map shapes) plus subtype
polymorphism via method overriding (`override on/off/emit`, narrowing
Node's untyped `EventEmitter` API to the caller-supplied event map).
`BaseJobQueue extends TypedEmitter<QueueEvents>` is the concrete
instantiation used by the app.
