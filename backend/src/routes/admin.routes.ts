import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { sharedQueue } from '../infrastructure/server.js';
import { validateQuery } from '../adapters/middleware/validate.middleware.js';
import { authorizeRoles } from '../adapters/middleware/auth.middleware.js';

const router = express.Router();
router.use(authorizeRoles('admin'));

const statsQuerySchema = z.object({
  userId: z.string().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const failedQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => Math.max(1, parseInt(v ?? '', 10) || 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.max(1, Math.min(100, parseInt(v ?? '', 10) || 10))),
  userId: z.string().optional(),
  q: z.string().optional(),
});

const bulkRetrySchema = z.object({
  jobIds: z.array(z.string()).min(1),
});

router.get('/queue/stats', validateQuery(statsQuerySchema), async (req: Request, res: Response) => {
  const { userId, date } = req.query as z.infer<typeof statsQuerySchema>;
  res.status(200).json(await sharedQueue.getDashboardStats({ userId, date }));
});

router.get('/queue/failed', validateQuery(failedQuerySchema), async (req: Request, res: Response) => {
  const { page, limit, userId, q } = req.query as unknown as z.infer<typeof failedQuerySchema>;
  res.status(200).json(await sharedQueue.searchFailedJobs({ page, limit, userId, searchQuery: q }));
});

router.post('/queue/retry/bulk', async (req: Request, res: Response) => {
  const parsed = bulkRetrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Bad JSON Body payload.', details: parsed.error.format() });
    return;
  }
  const count = await sharedQueue.retryBulkFailedJobs(parsed.data.jobIds);
  res.status(200).json({ message: 'Bulk execution run complete.', itemsReset: count });
});

export default router;
