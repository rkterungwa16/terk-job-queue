import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { sharedQueue } from '../infrastructure/server.js';
import { validateBody } from '../adapters/middleware/validate.middleware.js';
import { authorizeRoles } from '../adapters/middleware/auth.middleware.js';

const router = express.Router();

// These routes now back the admin dashboard's "schedule/pause/resume"
// controls, so they're gated the same way `admin.routes.ts` is. Previously
// this router had no auth at all; if some other, non-admin system still
// needs to schedule reminders programmatically, it'll need its own
// service-account route or token, not this one.
router.use(authorizeRoles('admin'));

const reminderSchema = z.object({
  userId: z.string().min(1),
  eventId: z.string().min(1),
  title: z.string().min(3),
  email: z.string().email(),
  firstRunTime: z
    .string()
    .datetime()
    .transform((v) => new Date(v))
    .refine((d) => d > new Date(), { message: 'Must be future date' }),
  type: z.enum(['one_time', 'hourly', 'daily', 'weekly']),
});

router.post('/schedule', validateBody(reminderSchema), async (req: Request, res: Response) => {
  const { userId, eventId, title, email, firstRunTime, type } = req.body as z.infer<typeof reminderSchema>;
  const delayMs = Math.max(0, firstRunTime.getTime() - Date.now());
  const job = await sharedQueue.add(
    'sendNotification',
    { userId, eventId, email, subject: `Alert: ${title}`, messageText: `Body text for ${title}` },
    {
      delayMs,
      uniqueKey: `user_${userId}_event_${eventId}_reminder`,
      isRecurring: type !== 'one_time',
      interval: type !== 'one_time' ? type : null,
    },
  );
  res.status(201).json({ message: 'Task queued.', jobId: job._id });
});

router.post('/pause', async (req: Request, res: Response) => {
  const eventId = String(req.body?.eventId ?? '');
  const count = await sharedQueue.pauseRecurring(eventId);
  res.status(200).json({ message: 'Paused action executed.', matches: count });
});

router.post('/resume', async (req: Request, res: Response) => {
  const eventId = String(req.body?.eventId ?? '');
  const count = await sharedQueue.resumeRecurring(eventId);
  res.status(200).json({ message: 'Resume action executed.', matches: count });
});

export default router;
