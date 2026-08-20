import { useCallback, useId, useState, type FormEvent } from 'react';
import { apiPost } from '../api/client';
import type { RecurrenceType, ScheduleJobRequest, ScheduleJobResponse } from '../types/api';
import { useMutation } from '../hooks/useMutation';

interface ScheduleJobFormProps {
  onScheduled: () => void;
}

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: 'one_time', label: 'One time' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

export function ScheduleJobForm({ onScheduled }: ScheduleJobFormProps) {
  const scheduleJob = useCallback((input: ScheduleJobRequest) => apiPost<ScheduleJobResponse>('/alerts/schedule', input), []);
  const { state, mutate } = useMutation(scheduleJob);

  const userIdField = useId();
  const eventIdField = useId();
  const titleField = useId();
  const emailField = useId();
  const timeField = useId();
  const typeField = useId();

  const [userId, setUserId] = useState('');
  const [eventId, setEventId] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [firstRunTime, setFirstRunTime] = useState('');
  const [type, setType] = useState<RecurrenceType>('one_time');

  const isSubmitting = state.status === 'loading';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // `<input type="datetime-local">` yields "YYYY-MM-DDTHH:mm" in the
    // browser's local time zone, with no timezone offset and no seconds -
    // the backend's zod schema requires a full ISO 8601 datetime string
    // (`z.string().datetime()`), so this converts via `Date` before sending.
    const isoFirstRunTime = new Date(firstRunTime).toISOString();
    const result = await mutate({ userId, eventId, title, email, firstRunTime: isoFirstRunTime, type });
    if (result) {
      // Clear the fields that identify *this* reminder so a mistaken
      // double-submit doesn't happen, but leave `userId`/`email` filled in
      // since an admin scheduling several reminders for the same person is
      // the common case.
      setEventId('');
      setTitle('');
      setFirstRunTime('');
      onScheduled();
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="schedule-form">
      <div className="schedule-form__grid">
        <div className="schedule-form__field">
          <label htmlFor={userIdField}>User ID</label>
          <input id={userIdField} value={userId} onChange={(e) => setUserId(e.target.value)} required />
        </div>
        <div className="schedule-form__field">
          <label htmlFor={eventIdField}>Event ID</label>
          <input id={eventIdField} value={eventId} onChange={(e) => setEventId(e.target.value)} required />
        </div>
        <div className="schedule-form__field">
          <label htmlFor={titleField}>Title</label>
          <input id={titleField} value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} required />
        </div>
        <div className="schedule-form__field">
          <label htmlFor={emailField}>Recipient email</label>
          <input id={emailField} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="schedule-form__field">
          <label htmlFor={timeField}>First run</label>
          <input id={timeField} type="datetime-local" value={firstRunTime} onChange={(e) => setFirstRunTime(e.target.value)} required />
        </div>
        <div className="schedule-form__field">
          <label htmlFor={typeField}>Recurrence</label>
          <select id={typeField} value={type} onChange={(e) => setType(e.target.value as RecurrenceType)}>
            {RECURRENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.status === 'error' && <p className="error-banner">{state.error}</p>}
      {state.status === 'success' && (
        <p className="success-banner">
          Scheduled — job ID <code>{state.data.jobId}</code>.
        </p>
      )}

      <button type="submit" className="primary" disabled={isSubmitting}>
        {isSubmitting ? 'Scheduling…' : 'Schedule reminder'}
      </button>
    </form>
  );
}
