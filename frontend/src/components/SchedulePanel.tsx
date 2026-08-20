import { ScheduleJobForm } from './ScheduleJobForm';
import { PauseResumeForm } from './PauseResumeForm';

interface SchedulePanelProps {
  onScheduled: () => void;
}

export function SchedulePanel({ onScheduled }: SchedulePanelProps) {
  return (
    <section className="schedule-panel" aria-label="Schedule and manage reminders">
      <h2>Schedule a reminder</h2>
      <ScheduleJobForm onScheduled={onScheduled} />

      <h3>Pause / resume a recurring reminder</h3>
      <PauseResumeForm />
    </section>
  );
}
