import { JobModel, type JobDocument } from '../model/job.model.js';
import { logToFile } from './queueLogger.js';
import { executeNotificationWorker } from '../../workers/notification.worker.js';
import { TypedEmitter } from './typedEmitter.js';
import {
  assertNever,
  type AddJobOptions,
  type JobOutcome,
  type JobStatus,
  type RecurrenceInterval,
  type StatsStatus,
  type StatusCounts,
  type TypedJob,
} from '../../types/job.types.js';
import type { Types } from 'mongoose';

interface QueueEvents {
  wakeUp: [];
  jobFinished: [];
}

export interface DashboardFilters {
  userId?: string;
  date?: string;
}

export interface FailedJobSearchOptions {
  page?: number;
  limit?: number;
  userId?: string;
  searchQuery?: string;
}

export interface PaginatedFailedJobs {
  pagination: { totalItems: number; totalPages: number; currentPage: number; itemsPerPage: number };
  results: JobDocument[];
}

/** Cap stored stack traces so error documents can't grow the collection unbounded under repeat failures. */
const MAX_STACK_CHARS = 2000;

export class BaseJobQueue extends TypedEmitter<QueueEvents> {
  private readonly concurrency: number;
  private activeCount = 0;
  private isProcessing = false;
  private readonly activeControllers: Map<string, AbortController> = new Map();
  private backupIntervalClock: NodeJS.Timeout | undefined;

  constructor(concurrency = 3) {
    super();
    this.concurrency = concurrency;

    this.on('wakeUp', () => this.startProcessing());
    this.on('jobFinished', () => this.startProcessing());

    // Backup poll: catches delayed/recurring jobs whose `runAt` has just
    // elapsed, since nothing else emits `wakeUp` for those. See
    // docs/PERFORMANCE.md for the trade-off of this interval's length.
    this.backupIntervalClock = setInterval(() => this.emit('wakeUp'), 5000);

    setTimeout(() => void this.trimJobHistory(7), 2000);
    setInterval(() => void this.trimJobHistory(7), 24 * 60 * 60 * 1000);
  }

  /**
   * Generic over `AddJobOptions` gives callers full type-checking on the
   * options bag (delayMs, isRecurring, interval, uniqueKey) without a second
   * hand-written interface duplicating `Job`'s fields.
   */
  async add(name: string, data: unknown, options: AddJobOptions = {}): Promise<JobDocument> {
    const delayMs = options.delayMs ?? 0;
    const isRecurring = options.isRecurring ?? false;
    const interval = options.interval ?? null;
    const uniqueKey = options.uniqueKey ?? null;
    const runAtTime = new Date(Date.now() + delayMs);

    try {
      const job = await JobModel.create({ name, data, runAt: runAtTime, isRecurring, interval, uniqueKey });
      if (delayMs === 0) this.emit('wakeUp');
      return job;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        await logToFile('INFO', 'DEDUPLICATION', `Blocked duplicate entry for key: ${uniqueKey ?? 'unknown'}`);
        const existing = await JobModel.findOne({ uniqueKey, status: { $in: ['pending', 'paused'] } });
        if (existing) return existing;
      }
      throw error;
    }
  }

  startProcessing(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    void this.next();
  }

  getNextRunDate(interval: RecurrenceInterval | null): Date {
    const now = new Date();
    if (interval === 'hourly') return new Date(now.getTime() + 60 * 60 * 1000);
    if (interval === 'daily') return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (interval === 'weekly') return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return now;
  }

  async next(): Promise<void> {
    if (this.activeCount >= this.concurrency || !this.isProcessing) {
      this.isProcessing = false;
      return;
    }

    // PERFORMANCE FIX: this query is now covered by the `{status:1, runAt:1}`
    // index added in job.model.ts - an index scan + index-order sort instead
    // of a full collection scan + in-memory sort. The `$expr` attempts<maxAttempts
    // comparison still can't use the index directly (it compares two document
    // fields to each other), but it now only has to be evaluated against the
    // small set of documents the status/runAt index already narrowed down to,
    // not the entire collection.
    const job = await JobModel.findOneAndUpdate(
      {
        status: { $in: ['pending', 'failed'] },
        $expr: { $lt: ['$attempts', '$maxAttempts'] },
        runAt: { $lte: new Date() },
      },
      {
        $set: { status: 'processing' as JobStatus },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { runAt: 1 } },
    );

    if (!job) {
      this.isProcessing = false;
      return;
    }

    const controller = new AbortController();
    const jobId = job._id.toString();
    this.activeControllers.set(jobId, controller);
    this.activeCount++;
    void this.next(); // keep filling remaining concurrency slots without waiting on this job

    try {
      if (job.name === 'sendNotification') {
        await executeNotificationWorker(job as TypedJob<'sendNotification'>, controller.signal);
      }
      this.activeControllers.delete(jobId);
      await this.finalize(job, { kind: 'success' });
    } catch (err) {
      this.activeControllers.delete(jobId);
      const outcome = this.classifyFailure(job, err);
      await this.finalize(job, outcome);
    } finally {
      this.activeCount--;
      this.emit('jobFinished');
    }
  }

  /**
   * Pure function from (job, error) -> JobOutcome. No DB access, no
   * side effects - this is the "discriminated state machine" transition
   * function. Keeping it pure and separate from `finalize` (the part that
   * actually writes to Mongo) is what makes each branch easy to unit test
   * in isolation and makes `finalize`'s switch exhaustive-checkable.
   */
  private classifyFailure(job: JobDocument, err: unknown): JobOutcome {
    const message = err instanceof Error ? err.message : 'Error';
    const stack = (err instanceof Error ? err.stack : undefined)?.slice(0, MAX_STACK_CHARS) ?? 'No Stack';
    const isAbort = err instanceof Error && err.name === 'AbortError';

    if (isAbort) return { kind: 'paused' };

    const finalFail = job.attempts >= job.maxAttempts;
    if (finalFail) return { kind: 'exhausted', reason: message, stack };

    const factor = Math.pow(2, job.attempts - 1);
    const delayMs = Math.max(500, Math.floor(Math.random() * (2000 * factor)));
    return { kind: 'retry', delayMs, reason: message, stack };
  }

  /**
   * PERFORMANCE + CORRECTNESS FIX: the original code re-fetched the job
   * (`findById`) purely to check whether a concurrent `pauseRecurring` call
   * had flipped its status to `paused_while_processing` while the worker was
   * running, then issued a *second* round trip to write the final status.
   * That's a classic read-then-write race: between the read and the write,
   * another request could still mutate the document, and the extra read is
   * a full network round trip on every single job.
   *
   * This version uses a MongoDB aggregation-pipeline update (`findOneAndUpdate`
   * with a pipeline instead of a plain update object, supported since
   * MongoDB 4.2): the "was it paused mid-flight?" check and the write happen
   * atomically, server-side, in one round trip - the check can never go
   * stale because there is no gap between reading and writing.
   */
  private async finalize(job: JobDocument, outcome: JobOutcome): Promise<void> {
    const pipeline = this.buildFinalizePipeline(job, outcome);

    const updated = await JobModel.findOneAndUpdate({ _id: job._id }, pipeline, { new: true });

    if (outcome.kind === 'exhausted') {
      await logToFile('ERROR', 'EXECUTION', `Job ${job._id.toString()} broke completely: ${outcome.reason}`);
    }

    // If a pause raced with this write, `finalize`'s own pipeline already
    // deferred to `paused_while_processing` (see buildFinalizePipeline), so
    // nothing further is needed here - just guard against a deleted doc.
    if (!updated) {
      await logToFile('WARN', 'EXECUTION', `Job ${job._id.toString()} vanished before it could be finalized.`);
    }
  }

  /**
   * Builds the Mongo aggregation-pipeline update for `finalize`. Regardless
   * of `outcome`, the write is conditioned server-side on the *current*
   * value of `status`: if another request already moved the document to
   * `paused_while_processing`, that always wins over whatever this worker
   * concluded - because the pause request is the newer, user-driven intent.
   */
  private buildFinalizePipeline(job: JobDocument, outcome: JobOutcome): Record<string, unknown>[] {
    const pausedBranch = { status: 'paused' as JobStatus, attempts: 0, errorReason: null, errorStack: null };

    const normalBranch = ((): Record<string, unknown> => {
      switch (outcome.kind) {
        case 'success':
          if (job.isRecurring) {
            return {
              status: 'pending' as JobStatus,
              attempts: 0,
              runAt: this.getNextRunDate(job.interval),
              errorReason: null,
              errorStack: null,
            };
          }
          return { status: 'completed' as JobStatus, errorReason: null, errorStack: null };

        case 'retry':
          return {
            status: 'pending' as JobStatus,
            runAt: new Date(Date.now() + outcome.delayMs),
            errorReason: outcome.reason,
            errorStack: outcome.stack,
          };

        case 'exhausted':
          return { status: 'failed' as JobStatus, errorReason: outcome.reason, errorStack: outcome.stack };

        case 'paused':
          // Worker aborted because of an explicit pause - same target state
          // as the "raced" branch below, just arrived at directly.
          return pausedBranch;

        default:
          return assertNever(outcome, 'buildFinalizePipeline');
      }
    })();

    return [
      {
        $set: {
          status: {
            $cond: [{ $eq: ['$status', 'paused_while_processing'] }, pausedBranch.status, normalBranch['status']],
          },
          attempts: {
            $cond: [
              { $eq: ['$status', 'paused_while_processing'] },
              pausedBranch.attempts,
              normalBranch['attempts'] ?? '$attempts',
            ],
          },
          runAt: {
            $cond: [{ $eq: ['$status', 'paused_while_processing'] }, '$runAt', normalBranch['runAt'] ?? '$runAt'],
          },
          errorReason: {
            $cond: [
              { $eq: ['$status', 'paused_while_processing'] },
              pausedBranch.errorReason,
              normalBranch['errorReason'] ?? null,
            ],
          },
          errorStack: {
            $cond: [
              { $eq: ['$status', 'paused_while_processing'] },
              pausedBranch.errorStack,
              normalBranch['errorStack'] ?? null,
            ],
          },
        },
      },
    ];
  }

  async pauseRecurring(eventId: string): Promise<number> {
    const activeJob = await JobModel.findOneAndUpdate(
      { 'data.eventId': eventId, isRecurring: true, status: 'processing' },
      { $set: { status: 'paused_while_processing' as JobStatus } },
      { new: true },
    );
    if (activeJob) {
      const ctrl = this.activeControllers.get(activeJob._id.toString());
      if (ctrl) {
        ctrl.abort();
        this.activeControllers.delete(activeJob._id.toString());
      }
      return 1;
    }
    const result = await JobModel.updateMany(
      { 'data.eventId': eventId, isRecurring: true, status: 'pending' },
      { $set: { status: 'paused' as JobStatus } },
    );
    return result.modifiedCount;
  }

  async resumeRecurring(eventId: string): Promise<number> {
    const result = await JobModel.updateMany(
      { 'data.eventId': eventId, isRecurring: true, status: 'paused' },
      { $set: { status: 'pending' as JobStatus, runAt: new Date() } },
    );
    if (result.modifiedCount > 0) this.emit('wakeUp');
    return result.modifiedCount;
  }

  async retryBulkFailedJobs(jobIds: (string | Types.ObjectId)[]): Promise<number> {
    const result = await JobModel.updateMany(
      { _id: { $in: jobIds }, status: 'failed' },
      { $set: { status: 'pending' as JobStatus, attempts: 0, runAt: new Date(), errorReason: null, errorStack: null } },
    );
    if (result.modifiedCount > 0) this.emit('wakeUp');
    return result.modifiedCount;
  }

  async getDashboardStats(
    filters: DashboardFilters = {},
  ): Promise<{ appliedFilters: DashboardFilters; jobCounts: StatusCounts }> {
    const matchQuery: Record<string, unknown> = {};
    if (filters.userId) matchQuery['data.userId'] = filters.userId;
    if (filters.date) {
      const s = new Date(filters.date);
      s.setUTCHours(0, 0, 0, 0);
      const e = new Date(filters.date);
      e.setUTCHours(23, 59, 59, 999);
      matchQuery['createdAt'] = { $gte: s, $lte: e };
    }

    const stats = await JobModel.aggregate<{ _id: StatsStatus; count: number }>([
      { $match: matchQuery },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const template: StatusCounts = { pending: 0, processing: 0, paused: 0, completed: 0, failed: 0 };
    for (const item of stats) {
      if (item._id in template) template[item._id] = item.count;
    }
    return { appliedFilters: filters, jobCounts: template };
  }

  async searchFailedJobs(options: FailedJobSearchOptions = {}): Promise<PaginatedFailedJobs> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 10));
    const query: Record<string, unknown> = { status: 'failed' };
    if (options.userId) query['data.userId'] = options.userId;
    if (options.searchQuery) {
      query['$or'] = [
        { name: { $regex: options.searchQuery, $options: 'i' } },
        { errorReason: { $regex: options.searchQuery, $options: 'i' } },
      ];
    }
    const [totalItems, jobs] = await Promise.all([
      JobModel.countDocuments(query),
      JobModel.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    return {
      pagination: { totalItems, totalPages: Math.ceil(totalItems / limit), currentPage: page, itemsPerPage: limit },
      results: jobs as unknown as JobDocument[],
    };
  }

  async recoverStuckJobs(): Promise<void> {
    const result = await JobModel.updateMany(
      { status: { $in: ['processing', 'paused_while_processing'] } },
      { $set: { status: 'pending' as JobStatus, runAt: new Date() } },
    );
    if (result.modifiedCount > 0) {
      await logToFile('WARN', 'RECOVERY', `Rescued ${result.modifiedCount} zombie tasks.`);
      this.emit('wakeUp');
    } else {
      await logToFile('INFO', 'RECOVERY', 'Clean server boot.');
    }
  }

  async trimJobHistory(daysToKeep = 7): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    // Covered by the {status:1, updatedAt:-1} index added in job.model.ts.
    const result = await JobModel.deleteMany({ status: { $in: ['completed', 'failed'] }, updatedAt: { $lt: cutoff } });
    if (result.deletedCount > 0) {
      await logToFile('INFO', 'CLEANUP', `Purged ${result.deletedCount} old files.`);
    }
  }

  async shutdown(): Promise<void> {
    this.isProcessing = false;
    if (this.backupIntervalClock) clearInterval(this.backupIntervalClock);
    if (this.activeCount > 0) {
      await new Promise<void>((resolve) => {
        const clr = setInterval(() => {
          if (this.activeCount === 0) {
            clearInterval(clr);
            resolve();
          }
        }, 200);
      });
    }
  }
}

/**
 * TYPE NARROWING on `unknown`: Mongo/Mongoose duplicate-key errors arrive
 * as `unknown` in a catch block (with `useUnknownInCatchVariables`, the TS
 * default since 4.4). Rather than casting, this narrows structurally -
 * "does this look like a Mongo error with code 11000?" - so the compiler
 * only allows `.code` access after the check succeeds.
 */
function isDuplicateKeyError(error: unknown): error is { code: 11000 } {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000;
}
