import { useCallback, useId, useState, type FormEvent } from 'react';
import { apiPost } from '../api/client';
import type { PauseResumeResponse } from '../types/api';
import { useMutation } from '../hooks/useMutation';

/**
 * Pausing/resuming a *recurring* reminder is the other half of "managing
 * scheduled queues" alongside creating one - both act on the same
 * `eventId` a recurring reminder was scheduled with, so this sits right
 * next to `ScheduleJobForm` in `SchedulePanel`. Kept as two independent
 * `useMutation` calls (one per action) rather than one hook with an
 * "action" parameter, since pause and resume have different response
 * shapes' semantics and can be in-flight/erred independently of each other.
 */
export function PauseResumeForm() {
  const eventIdField = useId();
  const [eventId, setEventId] = useState('');

  const pauseFn = useCallback((id: string) => apiPost<PauseResumeResponse>('/alerts/pause', { eventId: id }), []);
  const resumeFn = useCallback((id: string) => apiPost<PauseResumeResponse>('/alerts/resume', { eventId: id }), []);
  const pauseMutation = useMutation(pauseFn);
  const resumeMutation = useMutation(resumeFn);

  const isBusy = pauseMutation.state.status === 'loading' || resumeMutation.state.status === 'loading';

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    // No default submit action - Enter in the text field shouldn't guess
    // whether the admin meant "pause" or "resume".
    event.preventDefault();
  }

  return (
    <form onSubmit={handleSubmit} className="pause-resume-form">
      <div className="schedule-form__field">
        <label htmlFor={eventIdField}>Event ID</label>
        <input
          id={eventIdField}
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          placeholder="The event ID a recurring reminder was scheduled with"
        />
      </div>
      <div className="pause-resume-form__actions">
        <button type="button" disabled={isBusy || !eventId} onClick={() => void pauseMutation.mutate(eventId)}>
          Pause
        </button>
        <button type="button" disabled={isBusy || !eventId} onClick={() => void resumeMutation.mutate(eventId)}>
          Resume
        </button>
      </div>

      {pauseMutation.state.status === 'error' && <p className="error-banner">{pauseMutation.state.error}</p>}
      {pauseMutation.state.status === 'success' && (
        <p className="success-banner">
          {pauseMutation.state.data.message} ({pauseMutation.state.data.matches} match
          {pauseMutation.state.data.matches === 1 ? '' : 'es'})
        </p>
      )}

      {resumeMutation.state.status === 'error' && <p className="error-banner">{resumeMutation.state.error}</p>}
      {resumeMutation.state.status === 'success' && (
        <p className="success-banner">
          {resumeMutation.state.data.message} ({resumeMutation.state.data.matches} match
          {resumeMutation.state.data.matches === 1 ? '' : 'es'})
        </p>
      )}
    </form>
  );
}
