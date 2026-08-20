import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { Job, JobStatus, RecurrenceInterval } from '../../types/job.types.js';

/**
 * Mongoose document type = the plain domain `Job` interface plus whatever
 * Mongoose's `Document` base contributes (`.save()`, `.toObject()`, etc).
 * Kept as a `type` (not `interface`) because it's a mechanical intersection
 * of two existing shapes, not a new contract callers implement - see
 * docs/TYPESCRIPT_DECISIONS.md, "interface vs type".
 */
export type JobDocument = HydratedDocument<Job>;

const JobSchema = new Schema<Job>(
  {
    name: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'paused', 'paused_while_processing'] satisfies JobStatus[],
      default: 'pending',
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    runAt: { type: Date, default: Date.now },
    isRecurring: { type: Boolean, default: false },
    interval: {
      type: String,
      enum: ['hourly', 'daily', 'weekly'] satisfies RecurrenceInterval[],
      default: null,
    },
    uniqueKey: { type: String, default: null },
    errorReason: { type: String, default: null },
    errorStack: { type: String, default: null },
  },
  { timestamps: true },
);

/**
 * ---------------------------------------------------------------------------
 * PERFORMANCE FIX #1 - the missing index behind the queue's core query
 * ---------------------------------------------------------------------------
 * `BaseJobQueue.next()` claims work with:
 *
 *   JobModel.findOneAndUpdate(
 *     { status: { $in: ['pending', 'failed'] }, runAt: { $lte: new Date() }, ... },
 *     ...,
 *     { sort: { runAt: 1 } }
 *   )
 *
 * and it runs on a 5s timer *and* after every single job finishes, for the
 * entire lifetime of the process. The original schema only indexed
 * `{ 'data.userId': 1, createdAt: -1 }` and a partial unique index on
 * `uniqueKey` - neither covers `status`/`runAt` at all. Every claim attempt
 * was a full collection scan (COLLSCAN), and the in-memory sort on `runAt`
 * would blow Mongo's 32MB sort limit once the jobs collection grew past a
 * few hundred thousand documents (the `trimJobHistory` retention job caps
 * this, but only for *finished* jobs - a backlog of `pending`/`failed` work
 * is not pruned and is exactly what this query scans).
 *
 * This compound index puts `status` first (equality/`$in` predicate) and
 * `runAt` second (range + the sort key), which lets Mongo satisfy the
 * filter, the range condition, and the sort entirely from the index - no
 * in-memory sort stage at all.
 */
JobSchema.index({ status: 1, runAt: 1 });

/**
 * ---------------------------------------------------------------------------
 * PERFORMANCE FIX #2 - status+updatedAt for the admin/search/cleanup paths
 * ---------------------------------------------------------------------------
 * Three other hot paths filter/sort on `status` and `updatedAt` and had no
 * supporting index either:
 *   - `searchFailedJobs`: `{ status: 'failed', ... }` sorted by `updatedAt desc`
 *   - `trimJobHistory`: `{ status: { $in: ['completed','failed'] }, updatedAt: { $lt } }`
 *   - `getDashboardStats`'s `$group by status` benefits from a `status`-leading
 *     index too (index scan instead of collection scan for the `$match`).
 */
JobSchema.index({ status: 1, updatedAt: -1 });

// Original indexes, unchanged.
JobSchema.index({ 'data.userId': 1, createdAt: -1 });
JobSchema.index(
  { uniqueKey: 1 },
  { unique: true, partialFilterExpression: { uniqueKey: { $type: 'string' }, status: { $in: ['pending', 'paused'] } } },
);

export const JobModel: Model<Job> = mongoose.model<Job>('Job', JobSchema);
