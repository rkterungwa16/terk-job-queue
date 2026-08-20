import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';

export function RegisterForm() {
  const { register, state } = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const adminKeyId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const isSubmitting = state.status === 'authenticating';

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void register(email, password, adminKey || undefined);
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <label htmlFor={emailId}>Email</label>
      <input id={emailId} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />

      <label htmlFor={passwordId}>Password</label>
      <input
        id={passwordId}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
      />
      <p className="field-hint">At least 8 characters.</p>

      <label htmlFor={adminKeyId}>Admin key (optional)</label>
      <input id={adminKeyId} type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} autoComplete="off" />
      <p className="field-hint">Only needed to register as an admin. Leave blank for a regular account.</p>

      {state.status === 'error' && <p className="error-banner">{state.error}</p>}

      <button type="submit" className="primary" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
