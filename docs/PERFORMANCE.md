# Performance & Correctness Issues — Findings and Fixes

This document covers every performance-relevant issue found in the original
`jobqueue` app and exactly what changed in the TypeScript port to fix it.
File references are to the new locations under `backend/src/`.

## 1. Broken imports (would crash on boot)

`domain/queue/baseQueue.js` imported:

```js
import { JobModel } from '../models/job.model.js';                          // actual dir is `model/`, not `models/`
import { executeNotificationWorker } from '../../use-cases/workers/notification.worker.js'; // actual file is `workers/notifcation.worker.js`
```

Neither path exists in the uploaded zip. This isn't a performance issue in
the traditional sense, but it means the queue engine could never have
started in the first place — so every other performance characteristic
below was unobserved/untested in this codebase. Fixed by correcting the
paths (and the `notifcation` → `notification` filename typo) during the
TypeScript port. See `backend/src/domain/queue/baseQueue.ts` and
`backend/src/workers/notification.worker.ts`.

## 2. Missing index behind the queue's hottest query (the big one)

`BaseJobQueue.next()` claims the next job to run with:

```js
JobModel.findOneAndUpdate(
  { status: { $in: ['pending', 'failed'] }, $expr: {...}, runAt: { $lte: new Date() } },
  { $set: { status: 'processing' }, $inc: { attempts: 1 } },
  { new: true, sort: { runAt: 1 } }
)
```

This runs **on every `'wakeUp'`/`'jobFinished'` event and on a 5-second
timer, for the entire lifetime of the process** — it's by far the
highest-frequency query in the app. The original schema only defined:

```js
JobSchema.index({ 'data.userId': 1, createdAt: -1 });
JobSchema.index({ uniqueKey: 1 }, { unique: true, partialFilterExpression: {...} });
```

— neither of which covers `status` or `runAt`. Every claim attempt was
therefore a full **collection scan** (`COLLSCAN`), and the `sort: { runAt: 1 }`
had to happen **in memory**, since MongoDB can't use an index for the sort
without one covering the sort key. In-memory sorts are also subject to
MongoDB's 32MB working-set limit — a job backlog large enough would start
throwing `Sort exceeded memory limit` errors outright, not just run slowly.

**Fix** (`backend/src/domain/model/job.model.ts`):

```ts
JobSchema.index({ status: 1, runAt: 1 });
JobSchema.index({ status: 1, updatedAt: -1 });
```

The first index puts `status` (an equality/`$in` predicate) before `runAt`
(a range predicate *and* the sort key) — the standard "equality, sort, range"
index ordering rule for MongoDB compound indexes. This lets the query use an
index scan for the filter and satisfy the sort directly from the index, with
no in-memory sort stage.

One nuance worth calling out: the `$expr: { $lt: ['$attempts', '$maxAttempts'] }`
clause compares two fields on the *same* document to each other, which
MongoDB can never satisfy from an index (index entries don't know about
other fields' values ahead of time). It's still evaluated in memory — but
now only against the small set of documents the `status`/`runAt` index scan
already narrowed down to, not the entire collection. A further optimization
(not implemented here, to keep the change scoped) would be maintaining a
denormalized `isRetryable: boolean` flag updated whenever `attempts` changes,
letting the whole query become an indexable equality/range filter with no
`$expr` at all.

The second index (`status: 1, updatedAt: -1`) covers two other hot paths that
had the same problem: `searchFailedJobs` (filters `status: 'failed'`, sorts
by `updatedAt desc`) and `trimJobHistory` (filters
`status: { $in: ['completed','failed'] }, updatedAt: { $lt: cutoff }`, run
every 24h **and once 2 seconds after every process start**).

## 3. Redundant round trips + a race condition on job completion

The original `next()`, after a job finished (success or failure), did this:

```js
const latestJobState = await JobModel.findById(job._id);           // round trip #1 (read)
if (latestJobState.status === 'paused_while_processing') {
  await JobModel.findByIdAndUpdate(job._id, { $set: {...} });      // round trip #2 (write)
} else {
  await JobModel.findByIdAndUpdate(job._id, { $set: {...} });      // round trip #2 (write), different branch
}
```

Two problems:

- **Extra round trip.** Every single job completion pays for a full
  read-then-write instead of a single write. At the app's default
  concurrency of 3 and hundreds/thousands of jobs a day, that's a doubling
  of the database calls this hot path makes.
- **Race condition (TOCTOU — time-of-check to time-of-use).** Between the
  `findById` read and the `findByIdAndUpdate` write, a *different* request
  (an admin clicking "pause" on that same job's recurring series) could
  legally run `pauseRecurring()` and flip the status to
  `paused_while_processing`. The worker's write would then overwrite that
  pause with `completed`/`pending`, silently discarding the user's pause
  action. This is a genuine correctness bug hiding inside what looked like
  a performance shortcut.

**Fix** (`backend/src/domain/queue/baseQueue.ts`, `finalize()` /
`buildFinalizePipeline()`): the check-and-write collapses into a single
`findOneAndUpdate` call using a **MongoDB aggregation-pipeline update**
(an update expressed as an aggregation pipeline instead of a plain update
document — supported since MongoDB 4.2). The pipeline's `$cond` compares
the document's *current* `status` field against `paused_while_processing`
and picks between the "pause wins" branch and the "normal completion"
branch **atomically, server-side**. There is no gap between reading and
writing because there is no separate read — the whole decision happens
inside one atomic operation. This is both faster (one round trip instead of
two) and correct (no race window).

## 4. Unbounded error-stack storage

Every failed job stores `err.stack` verbatim in `errorStack`. Stack traces
are unbounded and, for jobs that fail repeatedly with deep call chains, can
be several KB each. Left unbounded, retained failed/paused documents bloat
the collection, slow down full-document reads (`searchFailedJobs` already
avoids `.lean()` waste here, but the documents themselves get heavier over
time), and increase index/storage overhead.

**Fix**: stack traces are truncated to 2000 characters (`MAX_STACK_CHARS` in
`baseQueue.ts`) before being written.

## 5. A no-op cancellation signal

The original worker passed `{ signal }` as a third argument to
`mg.messages.create(...)`. Mailgun's JS SDK client only accepts
`(domain, data)` — there is no cancellation parameter. This means a job that
was "paused while processing" and had its `AbortController` triggered could
never actually cancel an in-flight Mailgun API call; the abort only
mattered for how the *job document* got updated afterward, not for stopping
the network request itself. Documented explicitly in
`backend/src/workers/notification.worker.ts` rather than silently dropped,
since a genuine fix requires switching off the SDK to a `fetch`-based call
that respects `AbortSignal` — out of scope for this pass, but worth flagging
as a known limitation rather than leaving it looking functional.

## 6. Other things considered and *not* changed (documented trade-offs)

- **5-second backup poll interval.** `BaseJobQueue` re-checks for due work
  every 5 seconds regardless of load, as a backstop for delayed/recurring
  jobs whose `runAt` just elapsed (nothing else emits `wakeUp` for those).
  This is a legitimate polling trade-off, not a bug — tightening it
  increases responsiveness for delayed jobs at the cost of more idle-time
  queries; loosening it does the reverse. Left unchanged; a
  change-streams-based design would remove the need for polling entirely,
  but that's a bigger architectural change than this pass's scope.
- **No caching layer on `getDashboardStats`.** Every dashboard poll (every
  5s per connected admin, from the new frontend) re-runs a `$group`
  aggregation over the jobs collection. For a single admin dashboard this is
  fine; if this became a widely-used internal tool with many concurrent
  viewers, a short-TTL cache (even 2–3 seconds) in front of this endpoint
  would cut redundant aggregations without meaningfully staling the numbers.
  Not implemented here to avoid adding infrastructure (Redis, etc.) not
  present in the original app.
- **`logToFile` writes one `fs.appendFile` per log line.** Fine at current
  volumes; if job throughput grew by orders of magnitude, batching log
  lines in memory and flushing on an interval would reduce filesystem
  syscall overhead. Left unchanged as premature optimization for this app's
  current scale.

## Frontend performance work

See `docs/TYPESCRIPT_DECISIONS.md` for the React-hook-level performance
decisions (why `React.memo`, `useCallback`, `useMemo`, `useReducer`,
`useTransition`, debouncing, and the Page Visibility API are each used
where they're used) — those are inline-commented in the component/hook
source files themselves as well.
