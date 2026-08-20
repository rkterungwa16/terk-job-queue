import * as MailgunModule from 'mailgun.js';
import FormData from 'form-data';
import type { JobWorker } from '../types/job.types.js';

// mailgun.js ships a CJS default export; under Node ESM interop that can
// surface as either the class itself or `{ default: class }` depending on
// the resolver, so this narrows for both shapes rather than trusting one.
const MailgunCtor = ('default' in MailgunModule
  ? MailgunModule.default
  : MailgunModule) as unknown as typeof MailgunModule.default;

const mailgun = new MailgunCtor(FormData as ConstructorParameters<typeof MailgunCtor>[0]);
const mg = mailgun.client({
  username: 'api',
  key: process.env['MAILGUN_API_KEY'] ?? 'YOUR_MAILGUN_API_KEY',
});
const MAILGUN_DOMAIN = process.env['MAILGUN_DOMAIN'] ?? 'YOUR_MAILGUN_DOMAIN';

/**
 * Typed via `JobWorker<'sendNotification'>` (see types/job.types.ts). The
 * `job` parameter here is statically known to carry a `SendNotificationPayload`
 * - `job.data.email`, `.subject`, `.messageText` are all type-checked, so a
 * rename of any of those fields in the payload interface immediately flags
 * every worker/route that touches it, instead of failing at 2am in production
 * with "cannot read property 'email' of undefined".
 */
export const executeNotificationWorker: JobWorker<'sendNotification'> = async (job, signal) => {
  const { email, subject, messageText } = job.data;

  // NOTE (caught during the TS port): the original JS passed `{ signal }` as
  // a third argument to `mg.messages.create()`, but mailgun.js's own typed
  // client only accepts `(domain, data)` - there is no cancellation hook in
  // this SDK, so that `signal` was silently ignored at runtime and a paused
  // in-flight email send could never actually be aborted. `signal` is kept
  // in this function's parameter list (required by `JobWorker`) so callers
  // that *do* respect it elsewhere still compile, but this worker can't
  // honor it until a fetch-based Mailgun call replaces the SDK client.
  void signal;

  await mg.messages.create(MAILGUN_DOMAIN, {
    from: `Reminders App <noreply@${MAILGUN_DOMAIN}>`,
    to: [email],
    subject,
    text: messageText,
  });

  console.log(`[WORKER SUCCESS] Dispatched email notification to: ${email}`);
};
